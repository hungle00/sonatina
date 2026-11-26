import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services.homr_service import HomrService


class HomrServiceTests(unittest.TestCase):
    def test_frozen_app_resolves_homr_sidecar_next_to_application(self):
        executable_name = "homr.exe" if os.name == "nt" else "homr"
        with tempfile.TemporaryDirectory() as temporary_directory:
            application_directory = Path(temporary_directory)
            sidecar_directory = application_directory / "homr"
            sidecar_directory.mkdir()
            sidecar = sidecar_directory / executable_name
            sidecar.touch()
            application = application_directory / (
                "Sonatina.exe" if os.name == "nt" else "Sonatina"
            )

            with (
                patch("services.homr_service.sys.frozen", True, create=True),
                patch("services.homr_service.sys.executable", str(application)),
                patch("services.homr_service.shutil.which", return_value=None),
            ):
                resolved = HomrService._resolve_executable(None)

        self.assertEqual(resolved, str(sidecar))


if __name__ == "__main__":
    unittest.main()
