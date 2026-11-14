import assert from "node:assert/strict";
import test from "node:test";

import { ScoreSyncEngine } from "./scoreSync.js";

test("maps audio time to score time and reanchors when tempo changes", () => {
    const timeline = [
        { time_ms: 0, page: 0, cursor_id: "note-one" },
        { time_ms: 500, page: 0, cursor_id: "note-two" },
        { time_ms: 1000, page: 1, cursor_id: "note-three" }
    ];
    const sync = new ScoreSyncEngine(timeline);

    sync.start(10, 0.5);
    assert.equal(sync.scoreTimeAt(11), 500);
    assert.deepEqual(sync.takeEventsThrough(500), timeline.slice(0, 2));
    assert.equal(sync.setTempo(11, 2), 500);
    assert.equal(sync.scoreTimeAt(11.25), 1000);
    assert.equal(sync.audioTimeAt(1500), 11.5);
    assert.deepEqual(sync.takeEventsThrough(1000), timeline.slice(2));
});
