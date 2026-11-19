# Playback synchronization

The project environment's Verovio version is 6.4.1 (`getVersion()` reported
`6.4.1-fbe8f46`). `pyproject.toml` currently leaves the dependency unpinned.
The renderer uses the same toolkit instance for SVG pages, MIDI, and a timemap.
`renderToMIDI()` prepares timing; `renderToTimemap()` then returns
measure/rest events. `getPageWithElement()` maps their IDs to pages. The
verified `getElementsAtTime()` API also returns note IDs and a 1-based page,
while `getTimeForElement()` returns milliseconds. The backend converts
timemap pages to zero-based indices for the frontend.

The frontend `ScoreSyncEngine` maps `AudioContext.currentTime` to score
milliseconds using an audio-time anchor and tempo ratio. Playback events update
the visible page and place a vertical cursor at the matching SVG element.
Changing the tempo reanchors the mapping and reschedules the remaining MIDI.
The tempo control ranges from 50% to 150%.

Each timemap event also carries its measure ID. Clicking a Verovio SVG measure
looks up that measure's start time, reanchors the sync engine, and schedules
MIDI notes from that point. This works both while stopped and during playback;
an active playback is rescheduled without creating a new audio context.

Before scheduling Web Audio nodes, playback validates note timing, pitch,
velocity, and computed audio values; invalid MIDI is reported in the player
instead of passing non-finite values to an audio parameter.

Note highlighting is not included.
