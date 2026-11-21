from contextlib import contextmanager
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Iterator


DATA_DIR = Path(__file__).resolve().parents[2] / "data"


class ProjectSnapshotCleanupError(OSError):
    pass


class ProjectRevisionConflictError(RuntimeError):
    pass


class ProjectHasNoUndoError(RuntimeError):
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
                    parent_revision INTEGER,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (project_id) REFERENCES projects(id)
                        ON DELETE CASCADE,
                    FOREIGN KEY (project_id, parent_revision)
                        REFERENCES score_revisions(project_id, revision)
                        ON DELETE CASCADE,
                    UNIQUE (project_id, revision)
                );
                """
            )
            revision_columns = {
                row["name"]
                for row in connection.execute(
                    "PRAGMA table_info(score_revisions)"
                )
            }
            if "parent_revision" not in revision_columns:
                connection.execute(
                    "ALTER TABLE score_revisions "
                    "ADD COLUMN parent_revision INTEGER"
                )
                connection.execute(
                    """
                    UPDATE score_revisions
                    SET parent_revision = revision - 1
                    WHERE revision > 1
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

    def add_revision(
        self,
        project_id: str,
        musicxml: bytes,
        expected_revision: int,
    ) -> dict | None:
        temporary_path = None
        snapshot_path = None

        try:
            with self.connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                project = connection.execute(
                    """
                    SELECT id, current_revision
                    FROM projects
                    WHERE id = ?
                    """,
                    (project_id,),
                ).fetchone()
                if project is None:
                    return None

                current_revision = project["current_revision"]
                if current_revision != expected_revision:
                    raise ProjectRevisionConflictError(
                        f"Project is at revision {current_revision}, "
                        f"not {expected_revision}"
                    )

                revision = connection.execute(
                    """
                    SELECT COALESCE(MAX(revision), 0) + 1
                    FROM score_revisions
                    WHERE project_id = ?
                    """,
                    (project["id"],),
                ).fetchone()[0]
                relative_path = (
                    Path("musicxml")
                    / project["id"]
                    / f"revision-{revision}.musicxml"
                )
                snapshot_path = self.data_dir / relative_path
                temporary_path = snapshot_path.with_suffix(
                    ".musicxml.tmp"
                )
                snapshot_path.parent.mkdir(parents=True, exist_ok=True)

                with temporary_path.open("xb") as snapshot:
                    snapshot.write(musicxml)
                    snapshot.flush()
                    os.fsync(snapshot.fileno())
                os.replace(temporary_path, snapshot_path)

                connection.execute(
                    """
                    INSERT INTO score_revisions (
                        project_id, revision, musicxml_path, parent_revision
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        project["id"],
                        revision,
                        relative_path.as_posix(),
                        current_revision,
                    ),
                )
                connection.execute(
                    """
                    UPDATE projects
                    SET current_revision = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND current_revision = ?
                    """,
                    (revision, project["id"], current_revision),
                )
                updated_project = self._get_project_row(
                    connection,
                    project["id"],
                )
        except Exception:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            if snapshot_path is not None:
                snapshot_path.unlink(missing_ok=True)
            raise

        if updated_project is None:
            raise RuntimeError("Updated project could not be loaded")
        return dict(updated_project)

    def get_undo_content(
        self,
        project_id: str,
        expected_revision: int,
    ) -> bytes | None:
        with self.connect() as connection:
            project = connection.execute(
                """
                SELECT p.current_revision, current.parent_revision,
                    previous.musicxml_path
                FROM projects AS p
                JOIN score_revisions AS current
                    ON current.project_id = p.id
                    AND current.revision = p.current_revision
                LEFT JOIN score_revisions AS previous
                    ON previous.project_id = p.id
                    AND previous.revision = current.parent_revision
                WHERE p.id = ?
                """,
                (project_id,),
            ).fetchone()

        if project is None:
            return None
        if project["current_revision"] != expected_revision:
            raise ProjectRevisionConflictError(
                f"Project is at revision {project['current_revision']}, "
                f"not {expected_revision}"
            )
        if project["parent_revision"] is None:
            return None
        if project["musicxml_path"] is None:
            raise RuntimeError("Previous project revision could not be loaded")

        snapshot_path = self._revision_snapshot_path(
            project_id,
            project["musicxml_path"],
        )
        return snapshot_path.read_bytes()

    def undo_revision(
        self,
        project_id: str,
        expected_revision: int,
    ) -> dict | None:
        temporary_path = None
        snapshot_path = None

        try:
            with self.connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                current = connection.execute(
                    """
                    SELECT p.current_revision, revision.parent_revision
                    FROM projects AS p
                    JOIN score_revisions AS revision
                        ON revision.project_id = p.id
                        AND revision.revision = p.current_revision
                    WHERE p.id = ?
                    """,
                    (project_id,),
                ).fetchone()
                if current is None:
                    return None

                current_revision = current["current_revision"]
                if current_revision != expected_revision:
                    raise ProjectRevisionConflictError(
                        f"Project is at revision {current_revision}, "
                        f"not {expected_revision}"
                    )
                if current["parent_revision"] is None:
                    raise ProjectHasNoUndoError(
                        "There is no previous project revision to undo"
                    )

                previous = connection.execute(
                    """
                    SELECT musicxml_path, parent_revision
                    FROM score_revisions
                    WHERE project_id = ? AND revision = ?
                    """,
                    (project_id, current["parent_revision"]),
                ).fetchone()
                if previous is None:
                    raise RuntimeError("Previous project revision not found")

                source_path = self._revision_snapshot_path(
                    project_id,
                    previous["musicxml_path"],
                )
                musicxml = source_path.read_bytes()
                revision = connection.execute(
                    """
                    SELECT COALESCE(MAX(revision), 0) + 1
                    FROM score_revisions
                    WHERE project_id = ?
                    """,
                    (project_id,),
                ).fetchone()[0]
                relative_path = (
                    Path("musicxml")
                    / project_id
                    / f"revision-{revision}.musicxml"
                )
                snapshot_path = self.data_dir / relative_path
                temporary_path = snapshot_path.with_suffix(
                    ".musicxml.tmp"
                )

                with temporary_path.open("xb") as snapshot:
                    snapshot.write(musicxml)
                    snapshot.flush()
                    os.fsync(snapshot.fileno())
                os.replace(temporary_path, snapshot_path)

                connection.execute(
                    """
                    INSERT INTO score_revisions (
                        project_id, revision, musicxml_path, parent_revision
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        project_id,
                        revision,
                        relative_path.as_posix(),
                        previous["parent_revision"],
                    ),
                )
                connection.execute(
                    """
                    UPDATE projects
                    SET current_revision = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? AND current_revision = ?
                    """,
                    (revision, project_id, current_revision),
                )
                updated_project = self._get_project_row(
                    connection,
                    project_id,
                )
        except Exception:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            if snapshot_path is not None:
                snapshot_path.unlink(missing_ok=True)
            raise

        if updated_project is None:
            raise RuntimeError("Undone project could not be loaded")
        return dict(updated_project)

    def _revision_snapshot_path(
        self,
        project_id: str,
        musicxml_path: str,
    ) -> Path:
        storage_root = self.musicxml_dir.resolve()
        project_directory = (self.musicxml_dir / project_id).resolve()
        snapshot_path = (self.data_dir / musicxml_path).resolve()
        if (
            project_directory.parent != storage_root
            or not snapshot_path.is_relative_to(project_directory)
            or snapshot_path.parent != project_directory
        ):
            raise ValueError("Invalid MusicXML snapshot path")
        return snapshot_path

    @staticmethod
    def _get_project_row(
        connection: sqlite3.Connection,
        project_id: str,
    ) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT
                p.id, p.name, p.source_filename, p.created_at,
                p.updated_at, p.current_revision, r.musicxml_path,
                r.parent_revision IS NOT NULL AS can_undo
            FROM projects AS p
            JOIN score_revisions AS r
                ON r.project_id = p.id
                AND r.revision = p.current_revision
            WHERE p.id = ?
            """,
            (project_id,),
        ).fetchone()

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
            row = self._get_project_row(connection, project_id)
        return dict(row) if row else None

    def get_musicxml_path(self, project_id: str) -> Path | None:
        project = self.get_project(project_id)
        if project is None:
            return None

        return self._revision_snapshot_path(
            project_id,
            project["musicxml_path"],
        )

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
