from music21 import converter, tempo, meter


def load_score(file_path):
    return converter.parse(file_path)


def analyze_score(score):
    try:
        key = str(score.analyze("key"))
    except Exception:
        key = "Unknown"

    time_signatures = score.recurse().getElementsByClass(
        meter.TimeSignature
    )
    tempos = score.recurse().getElementsByClass(
        tempo.MetronomeMark
    )

    return {
        "key": key,
        "time_signature": (
            time_signatures[0].ratioString if time_signatures else "Unknown"
        ),
        "tempo": (
            str(tempos[0].number) if tempos else "Unknown"
        ),
        "parts": len(score.parts),
    }
