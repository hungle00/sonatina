export class ScoreSyncEngine {
    constructor(timeline = []) {
        this.timeline = timeline;
        this.reset();
    }

    reset() {
        this.scoreAnchorMs = 0;
        this.audioAnchorSeconds = 0;
        this.tempoRatio = 1;
        this.nextEventIndex = 0;
        this.started = false;
    }

    start(audioAnchorSeconds, tempoRatio, scoreAnchorMs = 0) {
        this.scoreAnchorMs = scoreAnchorMs;
        this.audioAnchorSeconds = audioAnchorSeconds;
        this.tempoRatio = tempoRatio;
        this.nextEventIndex = this.timeline.findIndex(
            event => event.time_ms >= scoreAnchorMs
        );
        if (this.nextEventIndex === -1) {
            this.nextEventIndex = this.timeline.length;
        }
        this.started = true;
    }

    scoreTimeAt(audioTimeSeconds) {
        if (!this.started) return 0;

        return Math.max(
            0,
            this.scoreAnchorMs +
                Math.max(0, audioTimeSeconds - this.audioAnchorSeconds) *
                    1000 *
                    this.tempoRatio
        );
    }

    audioTimeAt(scoreTimeMs) {
        if (!this.started) return 0;

        return (
            this.audioAnchorSeconds +
            (scoreTimeMs - this.scoreAnchorMs) / (1000 * this.tempoRatio)
        );
    }

    setTempo(audioTimeSeconds, tempoRatio) {
        const scoreTimeMs = this.scoreTimeAt(audioTimeSeconds);
        this.scoreAnchorMs = scoreTimeMs;
        this.audioAnchorSeconds = audioTimeSeconds;
        this.tempoRatio = tempoRatio;
        return scoreTimeMs;
    }

    takeEventsThrough(scoreTimeMs) {
        const events = [];

        while (
            this.nextEventIndex < this.timeline.length &&
            this.timeline[this.nextEventIndex].time_ms <= scoreTimeMs
        ) {
            events.push(this.timeline[this.nextEventIndex]);
            this.nextEventIndex += 1;
        }

        return events;
    }
}
