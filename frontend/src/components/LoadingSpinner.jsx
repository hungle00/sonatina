export default function LoadingSpinner({ label, className = "" }) {
    return (
        <span
            className={`loading-indicator ${className}`.trim()}
            role="status"
            aria-live="polite"
        >
            <span className="loading-spinner" aria-hidden="true" />
            <span>{label}</span>
        </span>
    );
}

export function LoadingOverlay({ label }) {
    return (
        <div className="loading-overlay">
            <LoadingSpinner label={label} />
        </div>
    );
}
