import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from api.projects import _create_project_from_musicxml
from api.scores import MAX_FILE_SIZE, safe_musicxml_filename
from services.homr_service import (
    HomrError,
    HomrService,
    HomrUnavailableError,
)

router = APIRouter()
SUPPORTED_EXTENSIONS = HomrService.SUPPORTED_EXTENSIONS


def _convert_and_create_project(
    content: bytes,
    input_filename: str,
    musicxml_filename: str,
) -> dict:
    extension = Path(input_filename).suffix.lower()
    with tempfile.TemporaryDirectory(prefix="omr_upload_") as temporary_directory:
        input_path = Path(temporary_directory) / f"score{extension}"
        output_path = Path(temporary_directory) / musicxml_filename
        input_path.write_bytes(content)

        HomrService().convert(input_path, output_path)
        return _create_project_from_musicxml(
            output_path.read_bytes(),
            musicxml_filename,
        )


@router.post("/omr/convert")
async def convert_score(file: UploadFile = File(...)):
    input_filename = safe_musicxml_filename(file.filename)
    extension = Path(input_filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, "Only PDF, PNG, JPG or JPEG files are supported")

    content = await file.read(MAX_FILE_SIZE + 1)
    if not content:
        raise HTTPException(400, "Empty file")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large (15 MB max)")

    stem = Path(input_filename).stem.strip()
    musicxml_filename = f"{stem or 'score'}.musicxml"
    print(musicxml_filename)
    try:
        return await run_in_threadpool(
            _convert_and_create_project,
            content,
            input_filename,
            musicxml_filename,
        )
    except HomrUnavailableError as error:
        raise HTTPException(503, str(error)) from error
    except HomrError as error:
        raise HTTPException(422, f"OMR conversion failed: {error}") from error
