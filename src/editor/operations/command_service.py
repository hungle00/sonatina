import argparse
from pathlib import Path

from editor.parts.extract import extract_part, save_part, save_parts
from editor.parts.instrument import get_instrument_info
from editor.score.transpose import transpose_to_key
from services.music_service import load_score


def _show_part(score_path: Path, part_index: int) -> None:
    part = extract_part(load_score(str(score_path)), part_index)
    part.show("text")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Edit MusicXML scores")
    commands = parser.add_subparsers(dest="command", required=True)

    transpose = commands.add_parser(
        "transpose",
        help="Transpose a score to a target tonic",
    )
    transpose.add_argument("score", type=Path)
    transpose.add_argument("target_key", help='Tonic name, for example "G"')
    transpose.add_argument("output", type=Path)

    list_parts = commands.add_parser("list-parts", help="List score parts")
    list_parts.add_argument("score", type=Path)

    show_part = commands.add_parser("show-part", help="Display one part as text")
    show_part.add_argument("score", type=Path)
    show_part.add_argument("part_index", type=int)

    save_one = commands.add_parser("save-part", help="Save one part as MusicXML")
    save_one.add_argument("score", type=Path)
    save_one.add_argument("part_index", type=int)
    save_one.add_argument("output", type=Path)

    save_all = commands.add_parser("save-parts", help="Save every part as MusicXML")
    save_all.add_argument("score", type=Path)
    save_all.add_argument("output_dir", type=Path)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    arguments = parser.parse_args(argv)

    try:
        if arguments.command == "transpose":
            score = load_score(str(arguments.score))
            transposed = transpose_to_key(score, arguments.target_key)
            arguments.output.parent.mkdir(parents=True, exist_ok=True)
            transposed.write("musicxml", fp=str(arguments.output))
            print(f"Saved transposed score to {arguments.output}")
        elif arguments.command == "list-parts":
            score = load_score(str(arguments.score))
            for info in get_instrument_info(score):
                print(f"{info.index}: {info.name} (id={info.part_id})")
        elif arguments.command == "show-part":
            _show_part(arguments.score, arguments.part_index)
        elif arguments.command == "save-part":
            score = load_score(str(arguments.score))
            saved_path = save_part(
                score,
                arguments.part_index,
                arguments.output,
            )
            print(f"Saved part to {saved_path}")
        elif arguments.command == "save-parts":
            score = load_score(str(arguments.score))
            for saved_path in save_parts(score, arguments.output_dir):
                print(f"Saved part to {saved_path}")
    except (IndexError, OSError, ValueError) as error:
        parser.error(str(error))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
