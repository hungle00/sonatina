from fastapi import APIRouter, UploadFile, File, HTTPException
from services.score_renderer import render_musicxml
from pathlib import Path

router = APIRouter()


@router.post("/scores/render")
async def render_score(file: UploadFile = File(...)):
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    if extension not in {".musicxml", ".xml"}:
        raise HTTPException(
            status_code=400,
            detail="Only MusicXML files (.musicxml, .xml) are supported"
        )

    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")

    try:
        pages = render_musicxml(content)
        return {
            "filename": filename,
            "page_count": len(pages),
            "pages": pages
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Failed to render score"
        )
