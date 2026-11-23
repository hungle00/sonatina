import asyncio
from io import BytesIO
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException, UploadFile

import api.omr as omr_api
import api.projects as projects_api
from services.homr_service import HomrError, HomrUnavailableError
from services.project_store import ProjectStore

MUSICXML = Path(__file__).with_name("fixtures").joinpath(
    "playback.musicxml"
).read_bytes()


def upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(filename=filename, file=BytesIO(content))


class ConvertScoreApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.previous_store = projects_api.project_store
        projects_api.project_store = ProjectStore(
            Path(self.temporary_directory.name)
        )

    def tearDown(self):
        projects_api.project_store = self.previous_store
        self.temporary_directory.cleanup()

    def test_converts_upload_and_creates_musicxml_project(self):
        uploaded_extensions = []

        class FakeHomrService:
            def convert(self, input_path, output_path):
                uploaded_extensions.append(input_path.suffix)
                output_path.write_bytes(MUSICXML)

        with (
            patch.object(omr_api, "HomrService", return_value=FakeHomrService()),
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
                omr_api.convert_score(upload("scores/aria.pdf", b"pdf"))
            )

        project = result["project"]
        self.assertEqual(uploaded_extensions, [".pdf"])
        self.assertEqual(project["source_filename"], "aria.musicxml")
        self.assertEqual(result["score"]["filename"], "aria.musicxml")
        self.assertEqual(result["score"]["pages"], ["svg"])
        self.assertEqual(
            projects_api.project_store.read_musicxml(project["id"]),
            MUSICXML,
        )

    def test_rejects_unsupported_input_before_conversion(self):
        with self.assertRaises(HTTPException) as raised:
            asyncio.run(omr_api.convert_score(upload("score.musicxml", b"xml")))

        self.assertEqual(raised.exception.status_code, 400)

    def test_rejects_empty_and_oversized_uploads(self):
        for content, expected_status in (
            (b"", 400),
            (b"x" * (omr_api.MAX_FILE_SIZE + 1), 413),
        ):
            with self.subTest(expected_status=expected_status):
                with self.assertRaises(HTTPException) as raised:
                    asyncio.run(
                        omr_api.convert_score(upload("score.png", content))
                    )

                self.assertEqual(raised.exception.status_code, expected_status)

    def test_reports_conversion_failure_and_missing_homr(self):
        for error, expected_status in (
            (HomrError("conversion failed"), 422),
            (HomrUnavailableError("homr is not installed"), 503),
        ):
            with self.subTest(expected_status=expected_status):
                service = Mock()
                service.convert.side_effect = error
                with patch.object(omr_api, "HomrService", return_value=service):
                    with self.assertRaises(HTTPException) as raised:
                        asyncio.run(
                            omr_api.convert_score(upload("score.jpg", b"image"))
                        )

                self.assertEqual(raised.exception.status_code, expected_status)


if __name__ == "__main__":
    unittest.main()
