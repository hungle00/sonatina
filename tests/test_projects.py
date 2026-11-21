import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services.project_store import ProjectStore, get_data_dir


MUSICXML = Path(__file__).with_name("fixtures").joinpath(
    "playback.musicxml"
).read_bytes()


class ProjectStoreTests(unittest.TestCase):
    def test_data_directory_can_be_overridden_for_packaged_installs(self):
        with patch.dict(
            os.environ,
            {"SONATINA_DATA_DIR": "~/SonatinaData"},
            clear=True,
        ):
            self.assertEqual(
                get_data_dir(),
                Path.home() / "SonatinaData",
            )

    def test_data_directory_uses_xdg_location_on_unix(self):
        with patch.dict(
            os.environ,
            {"XDG_DATA_HOME": "~/AppData"},
            clear=True,
        ):
            if os.name == "nt":
                self.skipTest("XDG data directories are not used on Windows")
            self.assertEqual(
                get_data_dir(),
                Path.home() / "AppData" / "Sonatina",
            )

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

            updated = store.add_revision(
                created["id"],
                MUSICXML.replace(b"note-one", b"note-new"),
                expected_revision=1,
            )

            self.assertEqual(updated["current_revision"], 2)
            self.assertIn("revision-2.musicxml", updated["musicxml_path"])
            self.assertEqual(
                store.read_musicxml(created["id"]),
                MUSICXML.replace(b"note-one", b"note-new"),
            )
            with self.assertRaisesRegex(RuntimeError, "not 1"):
                store.add_revision(
                    created["id"],
                    MUSICXML,
                    expected_revision=1,
                )
            self.assertEqual(
                store.get_project(created["id"])["current_revision"],
                2,
            )

    def test_undo_appends_previous_content_and_tracks_undo_lineage(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            store = ProjectStore(Path(temporary_directory))
            original = store.create_project(
                "playback",
                "playback.musicxml",
                MUSICXML,
            )
            edited_once = MUSICXML.replace(b"note-one", b"note-two")
            edited_twice = MUSICXML.replace(b"note-one", b"note-last")
            revision_two = store.add_revision(
                original["id"],
                edited_once,
                expected_revision=1,
            )
            store.add_revision(
                original["id"],
                edited_twice,
                expected_revision=2,
            )

            self.assertEqual(
                store.get_undo_content(original["id"], 3),
                edited_once,
            )
            undone_once = store.undo_revision(original["id"], 3)
            self.assertEqual(undone_once["current_revision"], 4)
            self.assertTrue(undone_once["can_undo"])
            self.assertEqual(store.read_musicxml(original["id"]), edited_once)

            self.assertEqual(
                store.get_undo_content(original["id"], 4),
                MUSICXML,
            )
            undone_twice = store.undo_revision(original["id"], 4)
            self.assertEqual(undone_twice["current_revision"], 5)
            self.assertFalse(undone_twice["can_undo"])
            self.assertEqual(store.read_musicxml(original["id"]), MUSICXML)
            self.assertIn("revision-5.musicxml", undone_twice["musicxml_path"])
            self.assertEqual(revision_two["current_revision"], 2)

            with self.assertRaisesRegex(RuntimeError, "no previous"):
                store.undo_revision(original["id"], 5)

    def test_migrates_existing_revision_table(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            data_dir = Path(temporary_directory)
            project_id = "legacy-project"
            project_directory = data_dir / "musicxml" / project_id
            project_directory.mkdir(parents=True)
            first_snapshot = Path("musicxml") / project_id / "revision-1.musicxml"
            second_snapshot = Path("musicxml") / project_id / "revision-2.musicxml"
            (data_dir / first_snapshot).write_bytes(MUSICXML)
            (data_dir / second_snapshot).write_bytes(b"edited")

            connection = sqlite3.connect(data_dir / "projects.sqlite3")
            connection.executescript(
                """
                CREATE TABLE projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    source_filename TEXT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    current_revision INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE score_revisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    musicxml_path TEXT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (project_id, revision)
                );
                """
            )
            connection.execute(
                """
                INSERT INTO projects (id, name, source_filename, current_revision)
                VALUES (?, ?, ?, ?)
                """,
                (project_id, "legacy", "score.musicxml", 2),
            )
            connection.executemany(
                """
                INSERT INTO score_revisions (
                    project_id, revision, musicxml_path
                )
                VALUES (?, ?, ?)
                """,
                [
                    (project_id, 1, first_snapshot.as_posix()),
                    (project_id, 2, second_snapshot.as_posix()),
                ],
            )
            connection.commit()
            connection.close()

            store = ProjectStore(data_dir)

            self.assertTrue(store.get_project(project_id)["can_undo"])
            self.assertEqual(
                store.get_undo_content(project_id, expected_revision=2),
                MUSICXML,
            )

    def test_missing_project_has_no_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            store = ProjectStore(Path(temporary_directory))

            self.assertIsNone(store.get_project("missing"))
            self.assertIsNone(store.read_musicxml("missing"))
            self.assertFalse(store.delete_project("missing"))

    def test_delete_project_removes_database_rows_and_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            store = ProjectStore(Path(temporary_directory))
            project = store.create_project(
                "playback",
                "playback.musicxml",
                MUSICXML,
            )
            store.add_revision(
                project["id"],
                MUSICXML.replace(b"note-one", b"note-two"),
                expected_revision=1,
            )
            snapshot_path = store.get_musicxml_path(project["id"])
            first_snapshot_path = (
                store.musicxml_dir
                / project["id"]
                / "revision-1.musicxml"
            )
            project_directory = snapshot_path.parent

            self.assertTrue(store.delete_project(project["id"]))
            self.assertIsNone(store.get_project(project["id"]))
            self.assertEqual(store.list_projects(), [])
            self.assertFalse(snapshot_path.exists())
            self.assertFalse(first_snapshot_path.exists())
            self.assertFalse(project_directory.exists())
            self.assertFalse(store.delete_project(project["id"]))
