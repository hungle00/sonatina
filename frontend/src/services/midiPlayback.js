export function createMidiNoteSchedules(
    notes,
    fromScoreMs,
    syncEngine,
    audioCurrentTime
) {
    if (
        !Number.isFinite(fromScoreMs) ||
        fromScoreMs < 0 ||
        !Number.isFinite(audioCurrentTime) ||
        !Number.isFinite(syncEngine.tempoRatio) ||
        syncEngine.tempoRatio <= 0
    ) {
        throw new Error("Cannot play MIDI with invalid playback timing.");
    }

    const minimumStartTime = audioCurrentTime + 0.025;
    const schedules = [];

    for (const note of notes) {
        if (
            !Number.isFinite(note.time) ||
            note.time < 0 ||
            !Number.isFinite(note.duration) ||
            note.duration < 0 ||
            !Number.isFinite(note.velocity) ||
            !Number.isFinite(note.midi)
        ) {
            throw new Error(
                "Cannot play MIDI because a note has invalid timing, pitch, or velocity data."
            );
        }

        const noteStartMs = note.time * 1000;
        const noteEndMs = noteStartMs + note.duration * 1000;
        if (!Number.isFinite(noteStartMs) || !Number.isFinite(noteEndMs)) {
            throw new Error(
                "Cannot play MIDI because a note has invalid timing data."
            );
        }

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
        const volume = Math.max(note.velocity * 0.15, 0.0001);
        const frequency = 440 * 2 ** ((note.midi - 69) / 12);

        if (
            !Number.isFinite(noteStart) ||
            !Number.isFinite(noteEnd) ||
            !Number.isFinite(volume) ||
            !Number.isFinite(frequency)
        ) {
            throw new Error(
                "Cannot play MIDI because a note produces invalid audio values."
            );
        }

        schedules.push({
            note,
            noteStart,
            noteEnd,
            volume,
            frequency
        });
    }

    return schedules;
}
