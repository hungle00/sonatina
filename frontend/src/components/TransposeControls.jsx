import { useState } from "react";

import LoadingSpinner from "./LoadingSpinner";

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

export default function TransposeControls({
    analysis,
    isTransposing,
    transposeError,
    onTranspose,
}) {
    const currentTonic = analysis?.key?.split(/\s+/)[0] || "";
    const sourceKeyAvailable = Boolean(
        currentTonic && currentTonic !== "Unknown"
    );
    const [targetKey, setTargetKey] = useState(
        sourceKeyAvailable ? currentTonic : ""
    );

    return (
        <div className="control-group">
            <label htmlFor="transpose-key">Transpose Key (Đổi giọng)</label>
            <select
                id="transpose-key"
                value={targetKey}
                disabled={!analysis || !sourceKeyAvailable || isTransposing}
                onChange={event => setTargetKey(event.target.value)}
            >
                {!targetKey && (
                    <option value="">Source key unavailable</option>
                )}
                {!KEY_OPTIONS.some(option => option.value === targetKey) &&
                    targetKey && (
                        <option value={targetKey}>{targetKey}</option>
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
                {isTransposing ? (
                    <LoadingSpinner label="Transposing..." />
                ) : (
                    "Transpose & Save"
                )}
            </button>
            {transposeError && (
                <p className="error-message" role="alert">{transposeError}</p>
            )}
        </div>
    );
}
