from concurrent.futures import ThreadPoolExecutor
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from music21 import converter

import api.projects as projects_api
from services.project_store import ProjectStore


MUSICXML = Path(__file__).with_name("fixtures").joinpath(
    "playback.musicxml"
).read_bytes()


class TransposeProjectApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.previous_store = projects_api.project_store
        projects_api.project_store = ProjectStore(
            Path(self.temporary_directory.name)
        )
        self.project = projects_api.project_store.create_project(
            "playback",
            "playback.musicxml",
            MUSICXML,
        )

    def tearDown(self):
        projects_api.project_store = self.previous_store
        self.temporary_directory.cleanup()

    def test_transpose_creates_revision_and_returns_rendered_score(self):
        with ThreadPoolExecutor(max_workers=1) as executor:
            result = executor.submit(
                projects_api.transpose_project,
                self.project["id"],
                projects_api.TransposeRequest(
                    target_key="D",
                    expected_revision=1,
                ),
            ).result()

        self.assertEqual(result["project"]["current_revision"], 2)
        self.assertEqual(result["score"]["filename"], "playback.musicxml")
        self.assertGreater(result["score"]["page_count"], 0)
        self.assertTrue(result["score"]["midi_base64"])
        self.assertEqual(result["analysis"]["key"], "D major")
        transposed_path = projects_api.project_store.get_musicxml_path(
            self.project["id"]
        )
        transposed_score = converter.parse(str(transposed_path))
        self.assertEqual(
            str(transposed_score.recurse().notes[0].pitch),
            "G3",
        )
        self.assertEqual(
            projects_api.project_store.get_project(self.project["id"])[
                "current_revision"
            ],
            2,
        )

    def test_stale_revision_returns_conflict_without_adding_revision(self):
        with self.assertRaises(HTTPException) as raised:
            projects_api.transpose_project(
                self.project["id"],
                projects_api.TransposeRequest(
                    target_key="G",
                    expected_revision=2,
                ),
            )

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            projects_api.project_store.get_project(self.project["id"])[
                "current_revision"
            ],
            1,
        )

    def test_render_failure_does_not_save_revision(self):
        with patch.object(
            projects_api,
            "_render_score_data",
            side_effect=HTTPException(500, "render failed"),
        ):
            with self.assertRaises(HTTPException):
                projects_api.transpose_project(
                    self.project["id"],
                    projects_api.TransposeRequest(
                        target_key="D",
                        expected_revision=1,
                    ),
                )

        self.assertEqual(
            projects_api.project_store.get_project(self.project["id"])[
                "current_revision"
            ],
            1,
        )


if __name__ == "__main__":
    unittest.main()
