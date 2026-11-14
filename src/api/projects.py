import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from api.scores import read_musicxml, safe_musicxml_filename
from services.music_service import analyze_score, load_score
from services.project_store import ProjectStore
from services.score_renderer import render_musicxml

router = APIRouter()
project_store = ProjectStore()


def _analyze_musicxml(content: bytes, filename: str) -> dict:
    suffix = Path(filename).suffix
    with tempfile.NamedTemporaryFile(suffix=suffix) as temporary_file:
        temporary_file.write(content)
        temporary_file.flush()
        return analyze_score(load_score(temporary_file.name))


def _build_response(project: dict, content: bytes) -> dict:
    try:
        pages, midi_base64, timeline = render_musicxml(content)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:
        raise HTTPException(500, "Failed to render project") from error

    analysis = None
    analysis_error = None
    try:
        analysis = _analyze_musicxml(content, project["source_filename"])
    except Exception:
        analysis_error = "Failed to analyze score"

    return {
        "project": {
            key: project[key]
            for key in (
                "id",
                "name",
                "source_filename",
                "created_at",
                "updated_at",
                "current_revision",
            )
        },
        "score": {
            "filename": project["source_filename"],
            "page_count": len(pages),
            "pages": pages,
            "midi_base64": midi_base64,
            "timeline": timeline,
        },
        "analysis": analysis,
        "analysis_error": analysis_error,
    }


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
        "project": {
            key: project[key]
            for key in (
                "id",
                "name",
                "source_filename",
                "created_at",
                "updated_at",
                "current_revision",
            )
        },
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
