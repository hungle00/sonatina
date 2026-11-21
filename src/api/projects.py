import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from api.scores import read_musicxml, safe_musicxml_filename
from services.music_service import analyze_score, load_score
from services.project_store import (
    ProjectHasNoUndoError,
    ProjectRevisionConflictError,
    ProjectSnapshotCleanupError,
    ProjectStore,
)
from services.score_renderer import render_musicxml
from services.score_transpose_service import (
    MusicXMLTranspositionError,
    transpose_musicxml,
)

router = APIRouter()
project_store = ProjectStore()


class TransposeRequest(BaseModel):
    target_key: str = Field(min_length=1, max_length=8)
    expected_revision: int | None = Field(default=None, ge=1)


class UndoRequest(BaseModel):
    expected_revision: int | None = Field(default=None, ge=1)


def _analyze_musicxml(content: bytes, filename: str) -> dict:
    suffix = Path(filename).suffix
    with tempfile.NamedTemporaryFile(suffix=suffix) as temporary_file:
        temporary_file.write(content)
        temporary_file.flush()
        return analyze_score(load_score(temporary_file.name))


def _render_score_data(content: bytes, filename: str) -> dict:
    try:
        pages, midi_base64, timeline = render_musicxml(content)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        raise HTTPException(500, "Failed to render project") from error

    analysis = None
    analysis_error = None
    try:
        analysis = _analyze_musicxml(content, filename)
    except Exception:
        analysis_error = "Failed to analyze score"

    return {
        "score": {
            "filename": filename,
            "page_count": len(pages),
            "pages": pages,
            "midi_base64": midi_base64,
            "timeline": timeline,
        },
        "analysis": analysis,
        "analysis_error": analysis_error,
    }


def _project_summary(project: dict) -> dict:
    project_summary = {
        key: project[key]
        for key in (
            "id",
            "name",
            "source_filename",
            "created_at",
            "updated_at",
            "current_revision",
        )
    }
    project_summary["can_undo"] = bool(project["can_undo"])
    return project_summary


def _project_response(project: dict, score_data: dict) -> dict:
    return {
        "project": _project_summary(project),
        **score_data,
    }


def _build_response(project: dict, content: bytes) -> dict:
    score_data = _render_score_data(content, project["source_filename"])
    return _project_response(project, score_data)


@router.get("/projects")
def list_projects():
    return {"projects": project_store.list_projects()}


@router.post("/projects")
async def create_project(file: UploadFile = File(...)):
    content = await read_musicxml(file)
    filename = safe_musicxml_filename(file.filename)
    try:
        pages, midi_base64, timeline = render_musicxml(content)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        raise HTTPException(500, "Failed to render score") from error

    try:
        analysis = _analyze_musicxml(content, filename)
        analysis_error = None
    except Exception:
        analysis = None
        analysis_error = "Failed to analyze score"

    title = Path(filename).stem.strip() or "Untitled score"
    project = project_store.create_project(title, filename, content)
    return {
        "project": _project_summary(project),
        "score": {
            "filename": filename,
            "page_count": len(pages),
            "pages": pages,
            "midi_base64": midi_base64,
            "timeline": timeline,
        },
        "analysis": analysis,
        "analysis_error": analysis_error,
    }


@router.get("/projects/{project_id}")
async def get_project(project_id: str):
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found")

    try:
        content = project_store.read_musicxml(project_id)
    except (OSError, ValueError) as error:
        raise HTTPException(500, "Could not read project MusicXML") from error

    if content is None:
        raise HTTPException(404, "Project not found")
    return _build_response(project, content)


@router.post("/projects/{project_id}/transpose")
def transpose_project(project_id: str, request: TransposeRequest):
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found")

    expected_revision = request.expected_revision

    if (
        expected_revision is not None
        and expected_revision != project["current_revision"]
    ):
        raise HTTPException(
            409,
            f"Project is at revision {project['current_revision']}; reload it "
            "before transposing",
        )
    expected_revision = project["current_revision"]

    try:
        content = project_store.read_musicxml(project_id)
    except (OSError, ValueError) as error:
        raise HTTPException(500, "Could not read project MusicXML") from error

    if content is None:
        raise HTTPException(404, "Project not found")

    try:
        transposed_content = transpose_musicxml(
            content,
            project["source_filename"],
            request.target_key,
        )
    except MusicXMLTranspositionError as error:
        raise HTTPException(400, f"Could not transpose score: {error}") from error
    except OSError as error:
        raise HTTPException(500, "Could not write transposed MusicXML") from error

    score_data = _render_score_data(
        transposed_content,
        project["source_filename"],
    )
    try:
        updated_project = project_store.add_revision(
            project_id,
            transposed_content,
            expected_revision,
        )
    except ProjectRevisionConflictError as error:
        raise HTTPException(
            409,
            f"{error}. Reload the project before transposing again.",
        ) from error
    except (OSError, ValueError) as error:
        raise HTTPException(500, "Could not save score revision") from error

    if updated_project is None:
        raise HTTPException(404, "Project not found")
    return _project_response(updated_project, score_data)


@router.post("/projects/{project_id}/undo")
def undo_project(
    project_id: str,
    request: UndoRequest | None = None,
):
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found")

    expected_revision = (
        request.expected_revision
        if request and request.expected_revision is not None
        else project["current_revision"]
    )
    if expected_revision != project["current_revision"]:
        raise HTTPException(
            409,
            f"Project is at revision {project['current_revision']}; reload it "
            "before undoing",
        )

    try:
        previous_content = project_store.get_undo_content(
            project_id,
            expected_revision,
        )
    except ProjectRevisionConflictError as error:
        raise HTTPException(
            409,
            f"{error}. Reload the project before undoing again.",
        ) from error
    except (OSError, ValueError, RuntimeError) as error:
        raise HTTPException(500, "Could not read previous score revision") from error

    if previous_content is None:
        raise HTTPException(409, "There is no previous revision to undo")

    score_data = _render_score_data(
        previous_content,
        project["source_filename"],
    )
    try:
        updated_project = project_store.undo_revision(
            project_id,
            expected_revision,
        )
    except ProjectHasNoUndoError as error:
        raise HTTPException(409, str(error)) from error
    except ProjectRevisionConflictError as error:
        raise HTTPException(
            409,
            f"{error}. Reload the project before undoing again.",
        ) from error
    except (OSError, ValueError, RuntimeError) as error:
        raise HTTPException(500, "Could not save undo revision") from error

    if updated_project is None:
        raise HTTPException(404, "Project not found")
    return _project_response(updated_project, score_data)


@router.get("/projects/{project_id}/export")
def export_project(project_id: str):
    project = project_store.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found")

    try:
        snapshot_path = project_store.get_musicxml_path(project_id)
    except ValueError as error:
        raise HTTPException(500, "Invalid project MusicXML path") from error

    if snapshot_path is None or not snapshot_path.is_file():
        raise HTTPException(404, "Project MusicXML not found")

    return FileResponse(
        snapshot_path,
        media_type="application/vnd.recordare.musicxml+xml",
        filename=project["source_filename"],
    )


@router.delete("/projects/{project_id}")
def delete_project(project_id: str):
    try:
        deleted = project_store.delete_project(project_id)
    except ProjectSnapshotCleanupError as error:
        raise HTTPException(500, str(error)) from error
    except (OSError, ValueError) as error:
        raise HTTPException(500, "Could not delete project") from error

    if not deleted:
        raise HTTPException(404, "Project not found")
    return {"deleted": True}
