from concurrent.futures import ThreadPoolExecutor
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

from fastapi import HTTPException
from music21 import converter

import api.projects as projects_api
from services.project_store import ProjectStore


MUSICXML = Path(__file__).with_name("fixtures").joinpath(
    "playback.musicxml"
).read_bytes()
MUSICXML_WITH_WORK_TITLE = MUSICXML.replace(
    b"  <part-list>",
    b"  <work><work-title>A Whole New World</work-title></work>\n"
    b"  <part-list>",
    1,
)
MUSICXML_WITH_TEMP_MOVEMENT_TITLE = MUSICXML_WITH_WORK_TITLE.replace(
    b"  <part-list>",
    b"  <movement-title>tmpcg69tvua.musicxml</movement-title>\n"
    b"  <part-list>",
    1,
)


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
            MUSICXML_WITH_WORK_TITLE,
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
        xml_root = ElementTree.parse(transposed_path).getroot()
        self.assertEqual(
            xml_root.findtext("movement-title"),
            "A Whole New World",
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

    def test_removes_legacy_temp_filename_movement_title(self):
        project = projects_api.project_store.create_project(
            "playback",
            "playback.musicxml",
            MUSICXML_WITH_TEMP_MOVEMENT_TITLE,
        )

        with ThreadPoolExecutor(max_workers=1) as executor:
            result = executor.submit(
                projects_api.transpose_project,
                project["id"],
                projects_api.TransposeRequest(
                    target_key="D",
                    expected_revision=1,
                ),
            ).result()

        snapshot_path = projects_api.project_store.get_musicxml_path(
            project["id"]
        )
        xml_root = ElementTree.parse(snapshot_path).getroot()
        self.assertEqual(result["project"]["current_revision"], 2)
        self.assertEqual(
            xml_root.findtext("movement-title"),
            "A Whole New World",
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

    def test_undo_restores_previous_score_and_creates_revision(self):
        transposed = projects_api.transpose_project(
            self.project["id"],
            projects_api.TransposeRequest(
                target_key="D",
                expected_revision=1,
            ),
        )

        result = projects_api.undo_project(
            self.project["id"],
            projects_api.UndoRequest(
                expected_revision=transposed["project"]["current_revision"],
            ),
        )

        self.assertEqual(result["project"]["current_revision"], 3)
        self.assertFalse(result["project"]["can_undo"])
        self.assertEqual(result["analysis"]["key"], "G major")
        self.assertEqual(
            projects_api.project_store.read_musicxml(self.project["id"]),
            MUSICXML_WITH_WORK_TITLE,
        )

    def test_undo_without_a_previous_revision_returns_conflict(self):
        with self.assertRaises(HTTPException) as raised:
            projects_api.undo_project(
                self.project["id"],
                projects_api.UndoRequest(expected_revision=1),
            )

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(
            projects_api.project_store.get_project(self.project["id"])[
                "current_revision"
            ],
            1,
        )

    def test_undo_render_failure_does_not_create_revision(self):
        projects_api.transpose_project(
            self.project["id"],
            projects_api.TransposeRequest(
                target_key="D",
                expected_revision=1,
            ),
        )
        with patch.object(
            projects_api,
            "_render_score_data",
            side_effect=HTTPException(500, "render failed"),
        ):
            with self.assertRaises(HTTPException):
                projects_api.undo_project(
                    self.project["id"],
                    projects_api.UndoRequest(expected_revision=2),
                )

        self.assertEqual(
            projects_api.project_store.get_project(self.project["id"])[
                "current_revision"
            ],
            2,
        )


if __name__ == "__main__":
    unittest.main()
