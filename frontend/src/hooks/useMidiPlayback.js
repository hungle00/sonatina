import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";

import { createMidiNoteSchedules } from "../services/midiPlayback";
import { ScoreSyncEngine } from "../services/scoreSync";

const EMPTY_TIMELINE = [];

function scheduleMidiNotes(audioContext, notes, fromScoreMs, syncEngine, nodes) {
    const schedules = createMidiNoteSchedules(
        notes,
        fromScoreMs,
        syncEngine,
        audioContext.currentTime
    );

    for (const { noteStart, noteEnd, volume, frequency } of schedules) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const scheduledNote = { oscillator, gain };

        oscillator.type = "triangle";
        oscillator.frequency.value = frequency;
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

export default function useMidiPlayback({
    midiBase64,
    timeline,
    pageCount,
    onPageChange,
    onPlaybackTick,
}) {
    const scoreTimeline = Array.isArray(timeline) ? timeline : EMPTY_TIMELINE;
    const syncEngine = useMemo(
        () => new ScoreSyncEngine(scoreTimeline),
        [scoreTimeline]
    );
    const measureEvents = useMemo(
        () => new Map(
            scoreTimeline
                .filter(event => event.measure_id)
                .map(event => [event.measure_id, event])
        ),
        [scoreTimeline]
    );
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackError, setPlaybackError] = useState("");
    const [tempoPercent, setTempoPercent] = useState(100);
    const [cursorAnchor, setCursorAnchor] = useState(null);
    const audioContextRef = useRef(null);
    const animationFrameRef = useRef(null);
    const playbackAudioStartTimeRef = useRef(0);
    const oscillatorNodesRef = useRef(new Set());
    const midiNotesRef = useRef([]);
    const midiDurationMsRef = useRef(0);
    const onPlaybackTickRef = useRef(onPlaybackTick);

    useEffect(() => {
        onPlaybackTickRef.current = onPlaybackTick;
    }, [onPlaybackTick]);

    const stopPlayback = useCallback(() => {
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
    }, [syncEngine]);

    const changeTempo = useCallback(nextTempoPercent => {
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
    }, [syncEngine]);

    const playMidi = useCallback(async (startScoreMs = 0) => {
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
            const midiDurationMs = midi.duration * 1000;
            const timelineDurationMs = scoreTimeline.at(-1)?.time_ms ?? 0;
            if (
                !Number.isFinite(midiDurationMs) ||
                !Number.isFinite(timelineDurationMs)
            ) {
                throw new Error("Cannot play MIDI because its duration is invalid.");
            }
            midiDurationMsRef.current = Math.max(
                midiDurationMs,
                timelineDurationMs
            );

            const audioStartTime = audioContext.currentTime + 0.1;
            playbackAudioStartTimeRef.current = audioStartTime;
            syncEngine.start(
                audioStartTime,
                tempoPercent / 100,
                startScoreMs
            );
            scheduleMidiNotes(
                audioContext,
                notes,
                startScoreMs,
                syncEngine,
                oscillatorNodesRef.current
            );
            setIsPlaying(true);

            const updatePlayback = () => {
                if (audioContextRef.current !== audioContext) {
                    return;
                }

                if (audioContext.currentTime < playbackAudioStartTimeRef.current) {
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
                        event.page < pageCount
                    ) {
                        onPageChange(event.page);
                    }

                    if (event.cursor_id) {
                        setCursorAnchor(event);
                    }
                }

                onPlaybackTickRef.current?.(scoreTimeMs);
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
    }, [
        midiBase64,
        onPageChange,
        pageCount,
        scoreTimeline,
        stopPlayback,
        syncEngine,
        tempoPercent,
    ]);

    const seekToMeasure = useCallback(measureId => {
        const measureEvent = measureEvents.get(measureId);
        if (!measureEvent || !midiBase64) {
            return;
        }

        const startScoreMs = measureEvent.time_ms;
        if (!Number.isFinite(startScoreMs) || startScoreMs < 0) {
            setPlaybackError("Cannot seek because this measure has invalid timing.");
            return;
        }
        onPageChange(measureEvent.page);
        setCursorAnchor(null);

        const audioContext = audioContextRef.current;
        if (!audioContext || audioContext.state === "closed") {
            void playMidi(startScoreMs);
            return;
        }

        const audioStartTime = audioContext.currentTime + 0.025;
        playbackAudioStartTimeRef.current = audioStartTime;
        stopScheduledNotes(audioContext, oscillatorNodesRef.current);
        syncEngine.start(
            audioStartTime,
            tempoPercent / 100,
            startScoreMs
        );
        scheduleMidiNotes(
            audioContext,
            midiNotesRef.current,
            startScoreMs,
            syncEngine,
            oscillatorNodesRef.current
        );
    }, [
        measureEvents,
        midiBase64,
        onPageChange,
        playMidi,
        syncEngine,
        tempoPercent,
    ]);

    useEffect(() => () => {
        window.cancelAnimationFrame(animationFrameRef.current);
        const audioContext = audioContextRef.current;

        if (audioContext && audioContext.state !== "closed") {
            stopScheduledNotes(audioContext, oscillatorNodesRef.current);
            void audioContext.close();
        }
    }, []);

    return {
        changeTempo,
        cursorAnchor,
        isPlaying,
        playbackError,
        playMidi,
        seekToMeasure,
        stopPlayback,
        tempoPercent,
    };
}
