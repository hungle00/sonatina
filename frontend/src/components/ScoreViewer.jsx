import { useEffect, useMemo, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import DOMPurify from "dompurify";

const DURATIONS = {
    "1": "Whole note",
    "2": "Half note",
    "4": "Quarter note",
    "8": "Eighth note",
    "16": "Sixteenth note",
    "32": "Thirty-second note",
    "64": "Sixty-fourth note",
    "128": "128th note"
};

const ACCIDENTALS = {
    s: "Sharp",
    f: "Flat",
    ss: "Double sharp",
    ff: "Double flat",
    n: "Natural"
};

export default function ScoreViewer({ pages, midiBase64 }) {
    const [page, setPage] = useState(0);
    const [zoom, setZoom] = useState(100);
    const [selectedNote, setSelectedNote] = useState(null);
    const [inspectorVisible, setInspectorVisible] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackError, setPlaybackError] = useState("");
    const audioContextRef = useRef(null);
    const playbackTimerRef = useRef(null);

    const svg = useMemo(() => {
        if (!pages?.[page]) return "";

        return DOMPurify.sanitize(pages[page], {
            USE_PROFILES: {
                svg: true,
                svgFilters: true
            },
            ADD_TAGS: ["use"]
        });
    }, [pages, page]);

    function stopPlayback() {
        window.clearTimeout(playbackTimerRef.current);
        const audioContext = audioContextRef.current;
        if (audioContext && audioContext.state !== "closed") {
            void audioContext.close();
        }
        audioContextRef.current = null;
        setIsPlaying(false);
    }

    async function playMidi() {
        stopPlayback();
        setPlaybackError("");

        try {
            const binary = window.atob(midiBase64);
            const midiBytes = Uint8Array.from(
                binary,
                character => character.charCodeAt(0)
            );
            const midi = new Midi(midiBytes);
            const notes = midi.tracks.flatMap(track => track.notes);

            if (!notes.length) {
                throw new Error("This score has no playable notes.");
            }

            const audioContext = new window.AudioContext();
            audioContextRef.current = audioContext;
            await audioContext.resume();
            const startTime = audioContext.currentTime + 0.1;

            for (const note of notes) {
                const oscillator = audioContext.createOscillator();
                const gain = audioContext.createGain();
                const noteStart = startTime + note.time;
                const noteEnd = noteStart + Math.max(note.duration, 0.05);
                const volume = Math.max(note.velocity * 0.15, 0.0001);

                oscillator.type = "triangle";
                oscillator.frequency.value =
                    440 * 2 ** ((note.midi - 69) / 12);
                gain.gain.setValueAtTime(0.0001, noteStart);
                gain.gain.exponentialRampToValueAtTime(volume, noteStart + 0.01);
                gain.gain.setValueAtTime(volume, Math.max(noteStart + 0.01, noteEnd - 0.03));
                gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd + 0.03);
                oscillator.connect(gain);
                gain.connect(audioContext.destination);
                oscillator.start(noteStart);
                oscillator.stop(noteEnd + 0.04);
            }

            setIsPlaying(true);
            playbackTimerRef.current = window.setTimeout(() => {
                if (audioContextRef.current === audioContext) {
                    void audioContext.close();
                    audioContextRef.current = null;
                    setIsPlaying(false);
                }
            }, midi.duration * 1000 + 150);
        } catch (error) {
            stopPlayback();
            setPlaybackError(
                error instanceof Error ? error.message : "Could not play MIDI."
            );
        }
    }

    useEffect(() => () => {
        window.clearTimeout(playbackTimerRef.current);
        const audioContext = audioContextRef.current;
        if (audioContext && audioContext.state !== "closed") {
            void audioContext.close();
        }
    }, []);

    function handleScoreClick(event) {
        const note = event.target.closest("g.note[id]");

        if (!note || !event.currentTarget.contains(note)) {
            return;
        }

        setSelectedNote({
            id: note.id,
            pitch: note.dataset.pname?.toUpperCase() ?? "Unknown",
            octave: note.dataset.oct ?? "Unknown",
            duration: DURATIONS[note.dataset.dur] ?? "Unknown",
            accidental: ACCIDENTALS[note.dataset.accid] ?? "None",
            dots: Number(note.dataset.dots ?? 0)
        });
    }

    function changeZoom(amount) {
        setZoom(current => Math.min(200, Math.max(50, current + amount)));
    }

    return (
        <div className="viewer">
            <div className="toolbar">
                <button onClick={() => changeZoom(-10)}>−</button>
                <span>{zoom}%</span>
                <button onClick={() => changeZoom(10)}>+</button>
                <button onClick={() => setZoom(100)}>Reset</button>
                <button
                    disabled={!midiBase64}
                    onClick={isPlaying ? stopPlayback : playMidi}
                >
                    {isPlaying ? "Stop" : "Play"}
                </button>
                <button
                    onClick={() => setInspectorVisible(visible => !visible)}
                >
                    {inspectorVisible ? "Hide inspector" : "Show inspector"}
                </button>
                {playbackError && (
                    <span className="playback-error" role="alert">
                        {playbackError}
                    </span>
                )}

                <div className="pagination">
                    <button
                        disabled={page === 0}
                        onClick={() => {
                            setPage(p => p - 1);
                            setSelectedNote(null);
                        }}
                    >
                        Previous
                    </button>

                    <span>{page + 1} / {pages.length}</span>

                    <button
                        disabled={page === pages.length - 1}
                        onClick={() => {
                            setPage(p => p + 1);
                            setSelectedNote(null);
                        }}
                    >
                        Next
                    </button>
                </div>
            </div>

            <div
                className={`viewer-content ${
                    inspectorVisible ? "" : "inspector-hidden"
                }`}
            >
                <div className="score-container">
                    <div
                        className="score-svg"
                        style={{ width: `${zoom}%` }}
                        onClick={handleScoreClick}
                        dangerouslySetInnerHTML={{ __html: svg }}
                    />
                </div>

                {inspectorVisible && (
                    <aside className="inspector">
                        <h3>Note Inspector</h3>

                        {selectedNote ? (
                            <dl>
                                <dt>Pitch</dt>
                                <dd>{selectedNote.pitch}{selectedNote.octave}</dd>

                                <dt>Duration</dt>
                                <dd>{selectedNote.duration}</dd>

                                <dt>Accidental</dt>
                                <dd>{selectedNote.accidental}</dd>

                                <dt>Dots</dt>
                                <dd>{selectedNote.dots}</dd>

                                <dt>Element ID</dt>
                                <dd>{selectedNote.id}</dd>
                            </dl>
                        ) : (
                            <p>Click a note to inspect its properties.</p>
                        )}
                    </aside>
                )}
            </div>
        </div>
    );
}
