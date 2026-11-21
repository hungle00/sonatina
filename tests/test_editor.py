import tempfile
import unittest
from pathlib import Path

from music21 import converter, instrument, key, note, stream

from editor.parts.extract import extract_part, save_part, save_parts
from editor.parts.instrument import get_instrument_info
from editor.score.transpose import transpose_to_key


def make_score() -> stream.Score:
    score = stream.Score()
    for part_id, part_instrument in (
        ("P1", instrument.Piano()),
        ("P2", instrument.Violin()),
    ):
        part = stream.Part(id=part_id)
        part.partName = part_instrument.instrumentName
        part.insert(0, part_instrument)
        part.insert(0, key.KeySignature(0))
        for pitch_name in ("C4", "D4", "E4", "G4", "C5"):
            part.append(note.Note(pitch_name))
        score.insert(0, part)
    return score


class TransposeToKeyTests(unittest.TestCase):
    def test_transposes_notes_and_key_signature_without_mutating_source(self):
        score = make_score()

        transposed = transpose_to_key(score, "D")

        self.assertEqual(
            [str(element.pitch) for element in transposed.recurse().notes[:5]],
            ["D4", "E4", "F#4", "A4", "D5"],
        )
        key_signatures = list(
            transposed.recurse().getElementsByClass(key.KeySignature)
        )
        self.assertTrue(key_signatures)
        self.assertEqual(key_signatures[0].sharps, 2)
        self.assertEqual(str(score.recurse().notes[0].pitch), "C4")


class PartEditingTests(unittest.TestCase):
    def test_instrument_info_and_extracted_part_are_independent(self):
        score = make_score()

        info = get_instrument_info(score)
        extracted = extract_part(score, 0)
        extracted.recurse().notes[0].pitch = "D4"

        self.assertEqual(
            [(item.index, item.part_id, item.name) for item in info],
            [(0, "P1", "Piano"), (1, "P2", "Violin")],
        )
        self.assertEqual(str(score.parts[0].recurse().notes[0].pitch), "C4")
        with self.assertRaises(IndexError):
            extract_part(score, 2)

    def test_saves_one_or_all_parts_as_musicxml(self):
        score = make_score()

        with tempfile.TemporaryDirectory() as temporary_directory:
            output_dir = Path(temporary_directory)
            one_path = save_part(score, 1, output_dir / "violin.musicxml")
            all_paths = save_parts(score, output_dir / "parts")

            self.assertTrue(one_path.is_file())
            self.assertEqual(len(all_paths), 2)
            self.assertTrue(all(path.is_file() for path in all_paths))
            exported = converter.parse(str(one_path))
            self.assertEqual(len(exported.parts), 1)
            self.assertEqual(
                exported.parts[0]
                .getInstrument(returnDefault=True)
                .instrumentName,
                "Violin",
            )


if __name__ == "__main__":
    unittest.main()
