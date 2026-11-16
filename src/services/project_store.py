from contextlib import contextmanager
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Iterator


DATA_DIR = Path(__file__).resolve().parents[2] / "data"


class ProjectSnapshotCleanupError(OSError):
    pass


class ProjectStore:
    def __init__(self, data_dir: Path = DATA_DIR):
        self.data_dir = Path(data_dir)
        self.database_path = self.data_dir / "projects.sqlite3"
        self.musicxml_dir = self.data_dir / "musicxml"
        self.initialize()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.musicxml_dir.mkdir(parents=True, exist_ok=True)

        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    source_filename TEXT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    current_revision INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY (id, current_revision)
                        REFERENCES score_revisions(project_id, revision)
                        DEFERRABLE INITIALLY DEFERRED
                );

                CREATE TABLE IF NOT EXISTS score_revisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    musicxml_path TEXT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id)
                        ON DELETE CASCADE,
                    UNIQUE (project_id, revision)
                );
                """
            )

    def create_project(
        self,
        name: str,
        source_filename: str,
        musicxml: bytes,
    ) -> dict:
        project_id = str(uuid.uuid4())
        revision = 1
        relative_path = Path("musicxml") / project_id / f"revision-{revision}.musicxml"
        snapshot_path = self.data_dir / relative_path
        temporary_path = snapshot_path.with_suffix(".musicxml.tmp")
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            with temporary_path.open("xb") as snapshot:
                snapshot.write(musicxml)
                snapshot.flush()
                os.fsync(snapshot.fileno())
            os.replace(temporary_path, snapshot_path)

            with self.connect() as connection:
                connection.execute(
                    """
                    INSERT INTO projects (id, name, source_filename)
                    VALUES (?, ?, ?)
                    """,
                    (project_id, name, source_filename),
                )
                connection.execute(
                    """
                    INSERT INTO score_revisions (
                        project_id, revision, musicxml_path
                    )
                    VALUES (?, ?, ?)
                    """,
                    (project_id, revision, relative_path.as_posix()),
                )
        except Exception:
            temporary_path.unlink(missing_ok=True)
            snapshot_path.unlink(missing_ok=True)
            try:
                snapshot_path.parent.rmdir()
            except OSError:
                pass
            raise

        project = self.get_project(project_id)
        if project is None:
            raise RuntimeError("New project could not be loaded")
        return project

    def list_projects(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    id, name, source_filename, created_at, updated_at,
                    current_revision
                FROM projects
                ORDER BY updated_at DESC, created_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def get_project(self, project_id: str) -> dict | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                    p.id, p.name, p.source_filename, p.created_at,
                    p.updated_at, p.current_revision, r.musicxml_path
                FROM projects AS p
                JOIN score_revisions AS r
                    ON r.project_id = p.id
                    AND r.revision = p.current_revision
                WHERE p.id = ?
                """,
                (project_id,),
            ).fetchone()
        return dict(row) if row else None

    def get_musicxml_path(self, project_id: str) -> Path | None:
        project = self.get_project(project_id)
        if project is None:
            return None

        storage_root = self.musicxml_dir.resolve()
        snapshot_path = (self.data_dir / project["musicxml_path"]).resolve()
        if not snapshot_path.is_relative_to(storage_root):
            raise ValueError("Invalid MusicXML snapshot path")
        return snapshot_path

    def read_musicxml(self, project_id: str) -> bytes | None:
        snapshot_path = self.get_musicxml_path(project_id)
        if snapshot_path is None:
            return None
        return snapshot_path.read_bytes()

    def delete_project(self, project_id: str) -> bool:
        moved_to_trash = False
        trash_directory = self.data_dir / (
            f".project-delete-{project_id}-{uuid.uuid4().hex}"
        )
        try:
            with self.connect() as connection:
                project = connection.execute(
                    "SELECT id FROM projects WHERE id = ?",
                    (project_id,),
                ).fetchone()
                if project is None:
                    return False

                revisions = connection.execute(
                    """
                    SELECT musicxml_path
                    FROM score_revisions
                    WHERE project_id = ?
                    """,
                    (project_id,),
                ).fetchall()
                storage_root = self.musicxml_dir.resolve()
                project_directory = (self.musicxml_dir / project_id).resolve()
                if (
                    not project_directory.is_relative_to(storage_root)
                    or project_directory.parent != storage_root
                ):
                    raise ValueError("Invalid project MusicXML directory")

                snapshot_names = []
                for revision in revisions:
                    snapshot_path = (
                        self.data_dir / revision["musicxml_path"]
                    ).resolve()
                    if (
                        not snapshot_path.is_relative_to(project_directory)
                        or snapshot_path.parent != project_directory
                    ):
                        raise ValueError("Invalid MusicXML snapshot path")
                    snapshot_names.append(snapshot_path.name)

                moved_to_trash = project_directory.is_dir()
                if moved_to_trash:
                    project_directory.rename(trash_directory)

                connection.execute(
                    "DELETE FROM projects WHERE id = ?",
                    (project_id,),
                )
        except Exception:
            if moved_to_trash and trash_directory.is_dir():
                trash_directory.rename(project_directory)
            raise

        if moved_to_trash:
            try:
                for snapshot_name in snapshot_names:
                    (trash_directory / snapshot_name).unlink(missing_ok=True)
                trash_directory.rmdir()
            except OSError as error:
                raise ProjectSnapshotCleanupError(
                    "Project was deleted but its MusicXML files could not be "
                    "fully removed"
                ) from error

        return True
