import { useState } from "react";

const KEY_OPTIONS = [
    { value: "C", label: "C" },
    { value: "D-", label: "D♭" },
    { value: "D", label: "D" },
    { value: "E-", label: "E♭" },
    { value: "E", label: "E" },
    { value: "F", label: "F" },
    { value: "F#", label: "F♯" },
    { value: "G", label: "G" },
    { value: "A-", label: "A♭" },
    { value: "A", label: "A" },
    { value: "B-", label: "B♭" },
    { value: "B", label: "B" },
];

export default function ScoreInspector({
    analysis,
    analysisError,
    selectedNote,
    isTransposing,
    transposeError,
    onTranspose,
    onClose,
}) {
    const currentTonic = analysis?.key?.split(/\s+/)[0] || "";
    const sourceKeyAvailable = Boolean(currentTonic && currentTonic !== "Unknown");
    const [targetKey, setTargetKey] = useState(
        sourceKeyAvailable ? currentTonic : ""
    );

    return (
        <aside className="editor-sidebar">
            <div className="sidebar-header">
                <span>Score Inspector</span>
                <button
                    className="sidebar-close"
                    aria-label="Close inspector"
                    onClick={onClose}
                >
                    ×
                </button>
            </div>
            <div className="sidebar-tabs">
                <div className="sidebar-tab active">Properties</div>
                <button
                    className="sidebar-tab"
                    disabled
                    title="Editor tools are not available yet"
                >
                    Editor Tools
                </button>
            </div>
            <div className="sidebar-content">
                <section className="inspector-properties">
                    <h3>Score overview</h3>
                    {analysis ? (
                        <dl>
                            <div>
                                <dt>Key</dt>
                                <dd>{analysis.key}</dd>
                            </div>
                            <div>
                                <dt>Time signature</dt>
                                <dd>{analysis.time_signature}</dd>
                            </div>
                            <div>
                                <dt>Tempo</dt>
                                <dd>{analysis.tempo}</dd>
                            </div>
                            <div>
                                <dt>Parts</dt>
                                <dd>{analysis.parts}</dd>
                            </div>
                        </dl>
                    ) : (
                        <p className="inspector-empty" role="status">
                            {analysisError || "Score analysis is unavailable."}
                        </p>
                    )}
                </section>
                <div className="control-group">
                    <label htmlFor="transpose-key">
                        Transpose Key (Đổi giọng)
                    </label>
                    <select
                        id="transpose-key"
                        value={targetKey}
                        disabled={!analysis || !sourceKeyAvailable || isTransposing}
                        onChange={event => setTargetKey(event.target.value)}
                    >
                        {!targetKey && (
                            <option value="">Source key unavailable</option>
                        )}
                        {!KEY_OPTIONS.some(option => option.value === targetKey) && (
                            targetKey && (
                                <option value={targetKey}>{targetKey}</option>
                            )
                        )}
                        {KEY_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <button
                        className="btn-primary transpose-submit"
                        disabled={
                            !analysis ||
                            !sourceKeyAvailable ||
                            !targetKey ||
                            targetKey === currentTonic ||
                            isTransposing
                        }
                        onClick={() => onTranspose(targetKey)}
                    >
                        {isTransposing ? "Transposing..." : "Transpose & Save"}
                    </button>
                    {transposeError && (
                        <p className="error-message" role="alert">
                            {transposeError}
                        </p>
                    )}
                </div>
                <div className="control-group">
                    <label htmlFor="score-dynamics">
                        Dynamics (Cường độ mặc định)
                    </label>
                    <select id="score-dynamics" disabled>
                        <option>Not available yet</option>
                    </select>
                </div>
                <div className="control-group">
                    <label>Editor Mode</label>
                    <div className="editor-mode-options">
                        <button className="tool-btn selected" disabled>
                            Pointer
                        </button>
                        <button className="tool-btn" disabled>
                            Note Input
                        </button>
                    </div>
                </div>
                <section className="inspector-properties">
                    <h3>Selected note</h3>
                    {selectedNote ? (
                        <dl>
                            <div>
                                <dt>Pitch</dt>
                                <dd>
                                    {selectedNote.pitch}
                                    {selectedNote.octave}
                                </dd>
                            </div>
                            <div>
                                <dt>Duration</dt>
                                <dd>{selectedNote.duration}</dd>
                            </div>
                            <div>
                                <dt>Accidental</dt>
                                <dd>{selectedNote.accidental}</dd>
                            </div>
                            <div>
                                <dt>Dots</dt>
                                <dd>{selectedNote.dots}</dd>
                            </div>
                            <div>
                                <dt>Element ID</dt>
                                <dd>{selectedNote.id}</dd>
                            </div>
                        </dl>
                    ) : (
                        <p className="inspector-empty">
                            Select a note on the score to see its properties.
                        </p>
                    )}
                </section>
            </div>
        </aside>
    );
}
