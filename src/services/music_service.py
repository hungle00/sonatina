from music21 import converter


def load_score(file_path: str):
    return converter.parse(file_path)


def analyze_score(score):
    try:
        key = str(score.analyze("key"))
    except Exception:
        key = "Unknown"

    return {
        "key": key,
        "parts": len(score.parts),
        "notes": len(list(score.recurse().notes)),
    }
