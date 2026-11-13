import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from services.music_service import (
    load_score,
    analyze_score,
)
from services.score_renderer import render_musicxml

router = APIRouter()

MAX_FILE_SIZE = 15 * 1024 * 1024
MUSICXML_EXTENSIONS = {".musicxml", ".xml"}


async def read_musicxml(file: UploadFile) -> bytes:
    extension = Path(file.filename or "").suffix.lower()

    if extension not in MUSICXML_EXTENSIONS:
        raise HTTPException(400, "Only MusicXML files are supported")

    content = await file.read()

    if not content:
        raise HTTPException(400, "Empty file")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large (15 MB max)")

    return content


@router.post("/scores/render")
async def render_score(file: UploadFile = File(...)):
    content = await read_musicxml(file)

    try:
        pages, midi_base64 = render_musicxml(content)

        return {
            "filename": file.filename,
            "page_count": len(pages),
            "pages": pages,
            "midi_base64": midi_base64,
        }
    except ValueError as error:
        raise HTTPException(400, str(error))
    except Exception:
        raise HTTPException(500, "Failed to render score")


@router.post("/scores/analyze")
async def analyze_uploaded_score(file: UploadFile = File(...)):
    content = await read_musicxml(file)
    extension = Path(file.filename or "").suffix.lower()

    try:
        with tempfile.NamedTemporaryFile(suffix=extension) as temp:
            temp.write(content)
            temp.flush()

            score = load_score(temp.name)
            result = analyze_score(score)

        return {
            "filename": file.filename,
            **result,
        }

    except Exception:
        raise HTTPException(400, "Failed to analyze score")
