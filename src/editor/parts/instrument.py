from dataclasses import dataclass

from music21 import stream


@dataclass(frozen=True)
class InstrumentInfo:
    index: int
    part_id: str
    name: str


def get_instrument_info(score: stream.Score) -> list[InstrumentInfo]:
    parts = list(score.parts)
    instruments = []

    for index, part in enumerate(parts):
        part_instrument = part.getInstrument(returnDefault=True)
        name = (
            part.partName
            or part_instrument.instrumentName
            or f"Part {index + 1}"
        )
        instruments.append(
            InstrumentInfo(
                index=index,
                part_id=str(part.id or index + 1),
                name=name,
            )
        )

    return instruments
