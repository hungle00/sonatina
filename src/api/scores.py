import tempfile
import zlib
from io import BytesIO
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile, ZipInfo

from fastapi import APIRouter, UploadFile, File, HTTPException

from services.music_service import (
    load_score,
    analyze_score,
)
from services.score_renderer import render_musicxml

router = APIRouter()

MAX_FILE_SIZE = 15 * 1024 * 1024
MUSICXML_EXTENSIONS = {".musicxml", ".xml", ".mxl"}
MAX_MXL_CONTAINER_SIZE = 1024 * 1024


def safe_musicxml_filename(filename: str | None) -> str:
    normalized = (filename or "").replace("\\", "/")
    safe_filename = Path(normalized).name or "score.musicxml"
    if Path(safe_filename).suffix.lower() == ".mxl":
        return f"{Path(safe_filename).stem}.musicxml"
    return safe_filename


def _read_mxl(content: bytes) -> bytes:
    try:
        with ZipFile(BytesIO(content)) as archive:
            def read_member(info: ZipInfo, max_size: int, too_large: str) -> bytes:
                if info.file_size > max_size:
                    raise HTTPException(413, too_large)
                with archive.open(info) as member:
                    result = member.read(max_size + 1)
                if len(result) > max_size:
                    raise HTTPException(413, too_large)
                return result

            container_info = archive.getinfo("META-INF/container.xml")
            container_content = read_member(
                container_info,
                MAX_MXL_CONTAINER_SIZE,
                "Invalid MXL container",
            )
            container_root = ElementTree.fromstring(container_content)
            rootfile = next(
                (
                    element
                    for element in container_root.iter()
                    if element.tag.rsplit("}", 1)[-1] == "rootfile"
                ),
                None,
            )
            rootfile_path = (
                rootfile.get("full-path", "")
                if rootfile is not None
                else ""
            )
            musicxml_path = PurePosixPath(rootfile_path)
            if (
                not rootfile_path
                or musicxml_path.is_absolute()
                or "\\" in rootfile_path
                or ".." in musicxml_path.parts
            ):
                raise HTTPException(400, "Invalid MXL root file path")

            musicxml_info = archive.getinfo(musicxml_path.as_posix())
            musicxml = read_member(
                musicxml_info,
                MAX_FILE_SIZE,
                "Uncompressed MusicXML file too large",
            )
    except HTTPException:
        raise
    except (
        BadZipFile,
        ElementTree.ParseError,
        EOFError,
        KeyError,
        NotImplementedError,
        OSError,
        RuntimeError,
        zlib.error,
    ) as error:
        raise HTTPException(400, "Invalid MXL file") from error

    try:
        root = ElementTree.fromstring(musicxml)
    except ElementTree.ParseError as error:
        raise HTTPException(400, "MXL does not contain valid MusicXML") from error
    if root.tag.rsplit("}", 1)[-1] not in {"score-partwise", "score-timewise"}:
        raise HTTPException(400, "MXL does not contain a MusicXML score")
    return musicxml


async def read_musicxml(file: UploadFile) -> bytes:
    normalized_filename = (file.filename or "").replace("\\", "/")
    extension = Path(normalized_filename).suffix.lower()

    if extension not in MUSICXML_EXTENSIONS:
        raise HTTPException(400, "Only MusicXML files are supported")

    content = await file.read(MAX_FILE_SIZE + 1)

    if not content:
        raise HTTPException(400, "Empty file")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File too large (15 MB max)")

    return _read_mxl(content) if extension == ".mxl" else content


@router.post("/scores/render")
async def render_score(file: UploadFile = File(...)):
    content = await read_musicxml(file)

    try:
        pages, midi_base64, timeline = render_musicxml(content)

        return {
            "filename": file.filename,
            "page_count": len(pages),
            "pages": pages,
            "midi_base64": midi_base64,
            "timeline": timeline,
        }
    except ValueError as error:
        raise HTTPException(400, str(error))
    except Exception:
        raise HTTPException(500, "Failed to render score")


@router.post("/scores/analyze")
async def analyze_uploaded_score(file: UploadFile = File(...)):
    content = await read_musicxml(file)
    extension = Path(safe_musicxml_filename(file.filename)).suffix.lower()

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
