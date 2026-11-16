from copy import deepcopy
from pathlib import Path
import re

from music21 import stream

from editor.parts.instrument import get_instrument_info


def extract_part(score: stream.Score, part_index: int) -> stream.Part:
    parts = list(score.parts)
    if not 0 <= part_index < len(parts):
        raise IndexError(
            f"Part index {part_index} is out of range; "
            f"score contains {len(parts)} parts"
        )

    return deepcopy(parts[part_index])


def save_part(
    score: stream.Score,
    part_index: int,
    output_path: str | Path,
) -> Path:
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    extract_part(score, part_index).write("musicxml", fp=str(destination))
    return destination


def save_parts(score: stream.Score, output_dir: str | Path) -> list[Path]:
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    paths = []

    for info in get_instrument_info(score):
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", info.name).strip("-._")
        filename = f"part-{info.index + 1}-{safe_name or 'part'}.musicxml"
        paths.append(save_part(score, info.index, destination / filename))

    return paths
