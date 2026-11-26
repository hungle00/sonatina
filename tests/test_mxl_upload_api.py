import asyncio
from io import BytesIO
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException, UploadFile

import api.projects as projects_api
from api.scores import read_musicxml, safe_musicxml_filename
from services.project_store import ProjectStore

MUSICXML = Path(__file__).with_name("fixtures").joinpath(
    "playback.musicxml"
).read_bytes()
CONTAINER_XML = (
    b'<?xml version="1.0" encoding="UTF-8"?>'
    b'<container><rootfiles><rootfile full-path="scores/score.xml" '
    b'media-type="application/vnd.recordare.musicxml+xml"/>'
    b'</rootfiles></container>'
)


def mxl_file(filename: str, musicxml: bytes = MUSICXML) -> UploadFile:
    archive = BytesIO()
    with ZipFile(archive, "w", ZIP_DEFLATED) as compressed_score:
        compressed_score.writestr("META-INF/container.xml", CONTAINER_XML)
        compressed_score.writestr("scores/score.xml", musicxml)
    return UploadFile(filename=filename, file=BytesIO(archive.getvalue()))


class MxlUploadApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.previous_store = projects_api.project_store
        projects_api.project_store = ProjectStore(
            Path(self.temporary_directory.name)
        )

    def tearDown(self):
        projects_api.project_store = self.previous_store
        self.temporary_directory.cleanup()

    def test_reads_mxl_and_normalizes_project_filename(self):
        content = asyncio.run(read_musicxml(mxl_file("scores/aria.MXL")))

        self.assertEqual(content, MUSICXML)
        self.assertEqual(
            safe_musicxml_filename("scores/aria.MXL"),
            "aria.musicxml",
        )

    def test_rejects_invalid_mxl_archives(self):
        invalid_upload = UploadFile(
            filename="score.mxl",
            file=BytesIO(b"not a zip file"),
        )

        with self.assertRaises(HTTPException) as raised:
            asyncio.run(read_musicxml(invalid_upload))

        self.assertEqual(raised.exception.status_code, 400)

    def test_creates_project_from_unpacked_mxl_musicxml(self):
        with (
            patch.object(
                projects_api,
                "render_musicxml",
                return_value=(["svg"], "midi", []),
            ),
            patch.object(
                projects_api,
                "_analyze_musicxml",
                return_value={"key": "G major"},
            ),
        ):
            result = asyncio.run(
                projects_api.create_project(mxl_file("aria.mxl"))
            )

        project = result["project"]
        self.assertEqual(project["source_filename"], "aria.musicxml")
        self.assertEqual(result["score"]["filename"], "aria.musicxml")
        self.assertEqual(
            projects_api.project_store.read_musicxml(project["id"]),
            MUSICXML,
        )


if __name__ == "__main__":
    unittest.main()
