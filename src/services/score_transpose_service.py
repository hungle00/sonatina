import re
import tempfile
from pathlib import Path

from music21.exceptions21 import Music21Exception

from editor.score.transpose import transpose_to_key
from services.music_service import load_score


class MusicXMLTranspositionError(Exception):
    pass


def _is_temporary_movement_name(
    movement_name: str | None,
    current_temp_name: str,
    source_suffix: str,
) -> bool:
    if movement_name == current_temp_name:
        return True

    return bool(
        re.fullmatch(
            rf"tmp[A-Za-z0-9]{{8}}{re.escape(source_suffix)}",
            movement_name or "",
            re.IGNORECASE,
        )
    )


def transpose_musicxml(
    content: bytes,
    source_filename: str,
    target_key: str,
) -> bytes:
    suffix = Path(source_filename).suffix

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix) as source_file:
            source_file.write(content)
            source_file.flush()
            score = load_score(source_file.name)
            if (
                score.metadata
                and _is_temporary_movement_name(
                    score.metadata.movementName,
                    Path(source_file.name).name,
                    suffix,
                )
            ):
                score.metadata.movementName = None

            transposed_score = transpose_to_key(score, target_key)
            with tempfile.NamedTemporaryFile(suffix=suffix) as output_file:
                transposed_score.write("musicxml", fp=output_file.name)
                output_file.seek(0)
                return output_file.read()
    except (Music21Exception, TypeError, ValueError) as error:
        raise MusicXMLTranspositionError(str(error)) from error
