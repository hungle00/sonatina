import { useState, useMemo } from "react";
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

export default function ScoreViewer({ pages }) {
    const [page, setPage] = useState(0);
    const [zoom, setZoom] = useState(100);
    const [selectedNote, setSelectedNote] = useState(null);

    const svg = useMemo(() => {
        if (!pages?.[page]) return "";

        return DOMPurify.sanitize(pages[page], {
            USE_PROFILES: { svg: true, svgFilters: true }
        });
    }, [pages, page]);

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

            <div className="viewer-content">
                <div className="score-container">
                    <div
                        className="score-svg"
                        style={{ width: `${zoom}%` }}
                        onClick={handleScoreClick}
                        dangerouslySetInnerHTML={{ __html: svg }}
                    />
                </div>

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
            </div>
        </div>
    );
}
