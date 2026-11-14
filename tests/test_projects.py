import tempfile
import unittest
from pathlib import Path

from services.project_store import ProjectStore


MUSICXML = Path(__file__).with_name("fixtures").joinpath(
    "playback.musicxml"
).read_bytes()


class ProjectStoreTests(unittest.TestCase):
    def test_create_and_reopen_project_revision(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            store = ProjectStore(Path(temporary_directory))
            created = store.create_project(
                "playback",
                "playback.musicxml",
                MUSICXML,
            )

            self.assertEqual(created["name"], "playback")
            self.assertEqual(created["source_filename"], "playback.musicxml")
            self.assertEqual(created["current_revision"], 1)
            self.assertEqual(store.read_musicxml(created["id"]), MUSICXML)
            self.assertEqual(
                store.list_projects(),
                [
                    {
                        key: created[key]
                        for key in (
                            "id",
                            "name",
                            "source_filename",
                            "created_at",
                            "updated_at",
                            "current_revision",
                        )
                    }
                ],
            )

            snapshot_path = store.get_musicxml_path(created["id"])
            self.assertTrue(snapshot_path.is_file())
            self.assertIn("revision-1.musicxml", str(snapshot_path))

    def test_missing_project_has_no_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            store = ProjectStore(Path(temporary_directory))

            self.assertIsNone(store.get_project("missing"))
            self.assertIsNone(store.read_musicxml("missing"))
