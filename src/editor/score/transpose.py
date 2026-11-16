from music21 import interval, key, pitch, stream


def transpose_to_key(
    score: stream.Score,
    target_key: str | key.Key | pitch.Pitch,
) -> stream.Score:
    """Return a copy transposed so its analyzed tonic matches ``target_key``.

    String targets are tonic names such as ``"G"`` or ``"B-"``. The
    transposition preserves the score's mode and leaves the input unchanged.
    """
    source_key = score.analyze("key")

    if isinstance(target_key, key.Key):
        target_tonic = target_key.tonic
    elif isinstance(target_key, pitch.Pitch):
        target_tonic = target_key
    elif isinstance(target_key, str):
        target_tonic = pitch.Pitch(target_key.strip())
    else:
        raise TypeError("target_key must be a tonic name, Pitch, or Key")

    transposition = interval.Interval(source_key.tonic, target_tonic)
    return score.transpose(transposition, inPlace=False)
