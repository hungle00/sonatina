export default function ScoreToolbar({
    isPlaying,
    midiAvailable,
    onPlay,
    onStop,
    tempoPercent,
    onTempoChange,
    page,
    pageCount,
    onPageStep,
    zoom,
    onZoomChange,
    inspectorVisible,
    onInspectorToggle,
    playbackError,
}) {
    function changeZoom(amount) {
        onZoomChange(current => Math.min(200, Math.max(50, current + amount)));
    }

    return (
        <div
            className="score-toolbar"
            role="toolbar"
            aria-label="Score controls"
        >
            <div className="toolbar-group playback-group">
                <button
                    className={`tool-btn ${isPlaying ? "primary" : ""}`}
                    disabled={!midiAvailable}
                    onClick={isPlaying ? onStop : onPlay}
                >
                    <span aria-hidden="true">{isPlaying ? "■" : "▶"}</span>
                    {isPlaying ? "Stop" : "Play"}
                </button>
                <details className="tempo-menu">
                    <summary
                        className="tool-btn tempo-button"
                        aria-label={`Tempo controls, currently ${tempoPercent}%`}
                        title={`Tempo: ${tempoPercent}%`}
                    >
                        <span aria-hidden="true">♩</span>
                        <span>{tempoPercent}%</span>
                    </summary>
                    <div className="tempo-popover">
                        <label className="tempo-control" htmlFor="playback-tempo">
                            <span>Playback tempo</span>
                            <strong>{tempoPercent}%</strong>
                        </label>
                        <input
                            id="playback-tempo"
                            className="tempo-slider"
                            aria-label="Playback tempo"
                            type="range"
                            min="50"
                            max="150"
                            step="5"
                            value={tempoPercent}
                            onChange={event =>
                                onTempoChange(Number(event.target.value))
                            }
                        />
                    </div>
                </details>
            </div>

            <div className="toolbar-group score-navigation">
                <button
                    className="tool-btn page-button"
                    aria-label="Previous page"
                    title="Previous page"
                    disabled={page === 0}
                    onClick={() => onPageStep(-1)}
                >
                    ‹
                </button>
                <span className="page-count">
                    Page {page + 1} / {pageCount}
                </span>
                <button
                    className="tool-btn page-button"
                    aria-label="Next page"
                    title="Next page"
                    disabled={page === pageCount - 1}
                    onClick={() => onPageStep(1)}
                >
                    ›
                </button>
            </div>

            <div className="toolbar-group toolbar-actions">
                <div className="zoom-controls" aria-label="Zoom controls">
                    <button
                        className="tool-btn zoom-button"
                        aria-label="Zoom out"
                        title="Zoom out"
                        onClick={() => changeZoom(-10)}
                    >
                        −
                    </button>
                    <span className="zoom-level">{zoom}%</span>
                    <button
                        className="tool-btn zoom-button"
                        aria-label="Zoom in"
                        title="Zoom in"
                        onClick={() => changeZoom(10)}
                    >
                        +
                    </button>
                    <button
                        className="tool-btn zoom-reset"
                        onClick={() => onZoomChange(100)}
                    >
                        Reset
                    </button>
                </div>
                <button
                    className={`tool-btn inspector-button ${
                        inspectorVisible ? "selected" : ""
                    }`}
                    aria-pressed={inspectorVisible}
                    onClick={onInspectorToggle}
                >
                    <span aria-hidden="true">⚙</span>
                    Inspector
                </button>
            </div>

            {playbackError && (
                <span className="playback-error" role="alert">
                    {playbackError}
                </span>
            )}
        </div>
    );
}
