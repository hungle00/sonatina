import unittest
from pathlib import Path

from services.score_renderer import render_musicxml


MUSICXML = Path(__file__).with_name("fixtures").joinpath(
    "playback.musicxml"
).read_bytes()


class RenderMusicXmlTests(unittest.TestCase):
    def test_returns_page_and_cursor_timeline_from_verovio(self):
        pages, midi_base64, timeline = render_musicxml(MUSICXML)

        self.assertEqual(len(pages), 1)
        self.assertTrue(midi_base64)
        self.assertEqual(timeline[0]["time_ms"], 0)
        self.assertEqual(timeline[0]["page"], 0)
        self.assertEqual(timeline[0]["cursor_id"], "note-one")
        self.assertTrue(timeline[0]["measure_id"])
        self.assertIn(f'id="{timeline[0]["measure_id"]}" class="measure"', pages[0])
        self.assertGreater(timeline[0]["next_time_ms"], timeline[0]["time_ms"])
        self.assertTrue(timeline[0]["next_cursor_id"])
        self.assertTrue(
            any(
                event["time_ms"] == 1500
                and event["page"] == 0
                and event["cursor_id"] == "note-two"
                and event["measure_id"]
                and f'id="{event["measure_id"]}" class="measure"' in pages[0]
                for event in timeline
            )
        )
        for event in timeline:
            if event["cursor_id"]:
                self.assertIn(f'id="{event["cursor_id"]}"', pages[0])


if __name__ == "__main__":
    unittest.main()
