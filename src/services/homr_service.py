"""Convert a printed score image/PDF to MusicXML with the homr CLI.

Requires: pip install 'homr[cpu]==0.7.1'
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path


class HomrError(RuntimeError):
    """An invalid input or failed homr conversion."""


class HomrUnavailableError(HomrError):
    """The homr executable is unavailable."""


class HomrService:
    SUPPORTED_EXTENSIONS = frozenset({".pdf", ".png", ".jpg", ".jpeg"})

    def __init__(
        self,
        executable: str | Path | None = None,
        timeout_seconds: int = 1800,
        skip_title: bool = False,
    ) -> None:
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        self.timeout_seconds = timeout_seconds
        self.skip_title = skip_title
        self.executable = self._resolve_executable(executable)

    @staticmethod
    def _resolve_executable(executable: str | Path | None) -> str:
        if executable is not None:
            resolved = shutil.which(str(executable))
            if resolved:
                return resolved
            path = Path(executable).expanduser().resolve()
            if path.is_file():
                return str(path)
            raise HomrUnavailableError(
                f"homr executable not found: {executable}"
            )

        scripts = "Scripts" if os.name == "nt" else "bin"
        name = "homr.exe" if os.name == "nt" else "homr"

        if getattr(sys, "frozen", False):
            executable_directory = Path(sys.executable).resolve().parent
            for candidate in (
                executable_directory / "homr" / name,
                executable_directory / name,
            ):
                if candidate.is_file():
                    return str(candidate)

        # Prefer the binary installed into the running Python's venv.
        candidate = Path(sys.prefix) / scripts / name
        if candidate.is_file():
            return str(candidate)

        located = shutil.which("homr")
        if located:
            return located
        raise HomrUnavailableError(
            "Cannot find homr. Activate your venv and run: "
            "python -m pip install 'homr[cpu]==0.7.1'"
        )

    def convert(self, input_path: str | Path, output_path: str | Path) -> Path:
        """Convert an existing PDF/PNG/JPG into a MusicXML file at output_path.

        homr creates PDF page PNGs and other sidecar files; all stay in a
        temporary work directory that is removed after the operation.
        Existing output_path is replaced only after success.
        """
        source = Path(input_path).expanduser().resolve()
        if not source.is_file():
            raise HomrError(f"Input file does not exist: {source}")
        if source.suffix.lower() not in self.SUPPORTED_EXTENSIONS:
            raise HomrError(
                "Unsupported file format. Use PDF, PNG, JPG or JPEG."
            )

        output = Path(output_path).expanduser().resolve()
        if output.suffix.lower() not in {".xml", ".musicxml"}:
            raise HomrError("Output path must end in .musicxml or .xml")

        with tempfile.TemporaryDirectory(prefix="homr_job_") as tmp:
            work_input = Path(tmp) / ("score" + source.suffix.lower())
            shutil.copyfile(source, work_input)

            cmd = [self.executable, str(work_input)]
            if self.skip_title:
                cmd.append("--no-title")

            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=self.timeout_seconds,
                    check=False,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            except subprocess.TimeoutExpired as exc:
                raise HomrError(
                    f"homr exceeded the {self.timeout_seconds}s timeout"
                ) from exc
            except OSError as exc:
                raise HomrUnavailableError(
                    f"Cannot launch homr: {exc}"
                ) from exc

            combined_log = "\n".join([result.stdout, result.stderr]).strip()
            if result.returncode != 0:
                raise HomrError(
                    f"homr failed (exit code {result.returncode}).\n"
                    + combined_log[-3500:]
                )

            generated = work_input.with_suffix(".musicxml")
            if not generated.is_file() or generated.stat().st_size == 0:
                raise HomrError(
                    "homr did not produce a MusicXML file.\n"
                    + combined_log[-3500:]
                )

            try:
                root = ET.parse(generated).getroot()
            except ET.ParseError as exc:
                raise HomrError(f"homr produced invalid XML: {exc}") from exc
            if root.tag.split("}")[-1] not in {"score-partwise", "score-timewise"}:
                raise HomrError(f"Unexpected MusicXML root: {root.tag}")

            output.parent.mkdir(parents=True, exist_ok=True)
            staging = output.with_name(
                f".{output.name}.{uuid.uuid4().hex}.partial"
            )
            try:
                shutil.copyfile(generated, staging)
                os.replace(staging, output)
            finally:
                staging.unlink(missing_ok=True)

        return output


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Convert PDF/image to MusicXML")
    parser.add_argument("input", help="Input PDF, PNG, JPG, or JPEG")
    parser.add_argument("output", help="Destination .musicxml file")
    parser.add_argument("--no-title", action="store_true", help="Skip OCR title detection")
    args = parser.parse_args()

    started = time.perf_counter()
    service = HomrService(skip_title=args.no_title)
    try:
        output = service.convert(args.input, args.output)
    except HomrError as exc:
        parser.exit(1, f"Error: {exc}\n")
    print(f"Created: {output} ({time.perf_counter() - started:.1f}s)")
