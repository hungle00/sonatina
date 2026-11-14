import { useEffect, useMemo, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import DOMPurify from "dompurify";

import { ScoreSyncEngine } from "../services/scoreSync";

const EMPTY_TIMELINE = [];

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

function scheduleMidiNotes(audioContext, notes, fromScoreMs, syncEngine, nodes) {
    const minimumStartTime = audioContext.currentTime + 0.025;

    for (const note of notes) {
        const noteStartMs = note.time * 1000;
        const noteEndMs = noteStartMs + note.duration * 1000;

        if (noteEndMs <= fromScoreMs) {
            continue;
        }

        const scheduledStartMs = Math.max(noteStartMs, fromScoreMs);
        const noteStart = Math.max(
            syncEngine.audioTimeAt(scheduledStartMs),
            minimumStartTime
        );
        const duration = Math.max(
            (noteEndMs - scheduledStartMs) /
                (1000 * syncEngine.tempoRatio),
            0.05
        );
        const noteEnd = noteStart + duration;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const volume = Math.max(note.velocity * 0.15, 0.0001);
        const scheduledNote = { oscillator, gain };

        oscillator.type = "triangle";
        oscillator.frequency.value =
            440 * 2 ** ((note.midi - 69) / 12);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(volume, noteStart + 0.01);
        gain.gain.setValueAtTime(
            volume,
            Math.max(noteStart + 0.01, noteEnd - 0.03)
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd + 0.03);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.onended = () => nodes.delete(scheduledNote);
        nodes.add(scheduledNote);
        oscillator.start(noteStart);
        oscillator.stop(noteEnd + 0.04);
    }
}

function stopScheduledNotes(audioContext, nodes) {
    const stopTime = audioContext.currentTime;

    for (const { oscillator, gain } of nodes) {
        gain.gain.cancelScheduledValues(stopTime);
        gain.gain.setTargetAtTime(0.0001, stopTime, 0.005);
        oscillator.stop(stopTime + 0.02);
    }

    nodes.clear();
}

export default function ScoreViewer({ pages, midiBase64, timeline }) {
    const scoreTimeline = Array.isArray(timeline) ? timeline : EMPTY_TIMELINE;
    const syncEngine = useMemo(
        () => new ScoreSyncEngine(scoreTimeline),
        [scoreTimeline]
    );
    const [page, setPage] = useState(0);
    const [zoom, setZoom] = useState(100);
    const [selectedNote, setSelectedNote] = useState(null);
    const [inspectorVisible, setInspectorVisible] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackError, setPlaybackError] = useState("");
    const [tempoPercent, setTempoPercent] = useState(100);
    const [cursorAnchor, setCursorAnchor] = useState(null);
    const audioContextRef = useRef(null);
    const animationFrameRef = useRef(null);
    const oscillatorNodesRef = useRef(new Set());
    const scoreContainerRef = useRef(null);
    const scorePageRef = useRef(null);
    const scoreSvgRef = useRef(null);
    const cursorElementRef = useRef(null);
    const cursorSegmentRef = useRef(null);
    const activePageRef = useRef(page);
    const previousPageRef = useRef(page);
    const midiNotesRef = useRef([]);
    const midiDurationMsRef = useRef(0);

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
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;

        const audioContext = audioContextRef.current;
        audioContextRef.current = null;
        syncEngine.reset();

        if (audioContext && audioContext.state !== "closed") {
            stopScheduledNotes(audioContext, oscillatorNodesRef.current);
            void audioContext.close();
        }

        setIsPlaying(false);
        setCursorAnchor(null);
        cursorSegmentRef.current = null;
    }

    function changeTempo(nextTempoPercent) {
        setTempoPercent(nextTempoPercent);

        const audioContext = audioContextRef.current;
        if (!audioContext || audioContext.state === "closed") {
            return;
        }

        const currentScoreMs = syncEngine.setTempo(
            audioContext.currentTime,
            nextTempoPercent / 100
        );
        stopScheduledNotes(audioContext, oscillatorNodesRef.current);
        scheduleMidiNotes(
            audioContext,
            midiNotesRef.current,
            currentScoreMs,
            syncEngine,
            oscillatorNodesRef.current
        );
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

            if (audioContextRef.current !== audioContext) {
                return;
            }

            midiNotesRef.current = notes;
            midiDurationMsRef.current = Math.max(
                midi.duration * 1000,
                scoreTimeline.at(-1)?.time_ms ?? 0
            );

            const audioStartTime = audioContext.currentTime + 0.1;
            syncEngine.start(audioStartTime, tempoPercent / 100);
            scheduleMidiNotes(
                audioContext,
                notes,
                0,
                syncEngine,
                oscillatorNodesRef.current
            );
            setIsPlaying(true);

            const updatePlayback = () => {
                if (audioContextRef.current !== audioContext) {
                    return;
                }

                if (audioContext.currentTime < audioStartTime) {
                    animationFrameRef.current =
                        window.requestAnimationFrame(updatePlayback);
                    return;
                }

                const scoreTimeMs = syncEngine.scoreTimeAt(
                    audioContext.currentTime
                );

                if (scoreTimeMs >= midiDurationMsRef.current) {
                    stopPlayback();
                    return;
                }

                for (const event of syncEngine.takeEventsThrough(scoreTimeMs)) {
                    if (
                        Number.isInteger(event.page) &&
                        event.page >= 0 &&
                        event.page < pages.length
                    ) {
                        activePageRef.current = event.page;
                        setPage(event.page);
                    }

                    if (event.cursor_id) {
                        setCursorAnchor(event);
                    }
                }

                const cursorSegment = cursorSegmentRef.current;
                if (
                    cursorSegment &&
                    cursorSegment.page === activePageRef.current
                ) {
                    const duration =
                        cursorSegment.endTimeMs - cursorSegment.startTimeMs;
                    const progress = duration > 0
                        ? Math.max(
                            0,
                            Math.min(
                                1,
                                (scoreTimeMs - cursorSegment.startTimeMs) /
                                    duration
                            )
                        )
                        : 1;
                    const left =
                        cursorSegment.startLeft +
                        (cursorSegment.endLeft - cursorSegment.startLeft) *
                            progress;

                    if (cursorElementRef.current) {
                        cursorElementRef.current.style.left = `${left}px`;
                    }
                }

                animationFrameRef.current =
                    window.requestAnimationFrame(updatePlayback);
            };

            animationFrameRef.current =
                window.requestAnimationFrame(updatePlayback);
        } catch (error) {
            stopPlayback();
            setPlaybackError(
                error instanceof Error ? error.message : "Could not play MIDI."
            );
        }
    }

    useEffect(() => () => {
        window.cancelAnimationFrame(animationFrameRef.current);
        const audioContext = audioContextRef.current;

        if (audioContext && audioContext.state !== "closed") {
            stopScheduledNotes(audioContext, oscillatorNodesRef.current);
            void audioContext.close();
        }
    }, []);

    useEffect(() => {
        activePageRef.current = page;

        if (previousPageRef.current !== page) {
            scoreContainerRef.current?.scrollTo({ top: 0, left: 0 });
            previousPageRef.current = page;
        }
    }, [page]);

    useEffect(() => {
        if (!isPlaying || !cursorAnchor || cursorAnchor.page !== page) {
            cursorSegmentRef.current = null;
            return;
        }

        const pageElement = scorePageRef.current;
        const scoreSvg = scoreSvgRef.current;
        const scoreContainer = scoreContainerRef.current;
        const cursorElement = cursorElementRef.current;

        if (!pageElement || !scoreSvg || !scoreContainer || !cursorElement) {
            cursorSegmentRef.current = null;
            return;
        }

        const elements = Array.from(scoreSvg.querySelectorAll("[id]"));
        const target = elements.find(
            element => element.id === cursorAnchor.cursor_id
        );

        if (!target) {
            cursorSegmentRef.current = null;
            cursorElement.style.visibility = "hidden";
            return;
        }

        const nextTarget = cursorAnchor.next_cursor_id
            ? elements.find(
                element => element.id === cursorAnchor.next_cursor_id
            )
            : null;
        const sameSystem = nextTarget &&
            target.closest("g.system") === nextTarget.closest("g.system");
        const pageBounds = pageElement.getBoundingClientRect();
        const targetBounds = target.getBoundingClientRect();
        const containerBounds = scoreContainer.getBoundingClientRect();
        const targetCenter = targetBounds.top + targetBounds.height / 2;
        const startLeft =
            targetBounds.left + targetBounds.width / 2 - pageBounds.left;
        const nextBounds = nextTarget?.getBoundingClientRect();
        const endLeft = sameSystem && nextBounds
            ? nextBounds.left + nextBounds.width / 2 - pageBounds.left
            : startLeft;

        cursorElement.style.left = `${startLeft}px`;
        cursorElement.style.visibility = "visible";
        cursorSegmentRef.current = {
            page,
            startTimeMs: cursorAnchor.time_ms,
            endTimeMs: cursorAnchor.next_time_ms ?? cursorAnchor.time_ms,
            startLeft,
            endLeft
        };

        if (
            targetBounds.top < containerBounds.top ||
            targetBounds.bottom > containerBounds.bottom
        ) {
            scoreContainer.scrollTo({
                top: Math.max(
                    0,
                    scoreContainer.scrollTop +
                        targetCenter -
                        containerBounds.top -
                        scoreContainer.clientHeight / 2
                ),
                behavior: "smooth"
            });
        }

        if (
            targetBounds.left < containerBounds.left ||
            targetBounds.right > containerBounds.right
        ) {
            scoreContainer.scrollTo({
                left: Math.max(
                    0,
                    scoreContainer.scrollLeft +
                        targetBounds.left +
                        targetBounds.width / 2 -
                        containerBounds.left -
                        scoreContainer.clientWidth / 2
                ),
                behavior: "smooth"
            });
        }
    }, [cursorAnchor, isPlaying, page, svg, zoom]);

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
                <label className="tempo-control">
                    Tempo {tempoPercent}%
                    <input
                        aria-label="Playback tempo"
                        type="range"
                        min="50"
                        max="150"
                        step="5"
                        value={tempoPercent}
                        onChange={event =>
                            changeTempo(Number(event.target.value))
                        }
                    />
                </label>
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
                <div className="score-container" ref={scoreContainerRef}>
                    <div
                        className="score-page"
                        ref={scorePageRef}
                        style={{ width: `${zoom}%` }}
                    >
                        <div
                            className="score-svg"
                            ref={scoreSvgRef}
                            onClick={handleScoreClick}
                            dangerouslySetInnerHTML={{ __html: svg }}
                        />
                        {isPlaying &&
                            cursorAnchor?.page === page && (
                                <div
                                    aria-hidden="true"
                                    className="playback-cursor"
                                    ref={cursorElementRef}
                                    style={{
                                        left: 0,
                                        visibility: "hidden"
                                    }}
                                />
                            )}
                    </div>
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
