export default function ScoreCanvas({
    containerRef,
    pageRef,
    svgRef,
    cursorRef,
    svg,
    zoom,
    onClick,
    isPlaying,
    cursorVisible,
}) {
    return (
        <div
            className="score-container score-canvas-container"
            ref={containerRef}
        >
            <div
                className="score-page"
                ref={pageRef}
                style={{ width: `${zoom}%` }}
            >
                <div
                    className="score-svg"
                    ref={svgRef}
                    onClick={onClick}
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
                {isPlaying && cursorVisible && (
                    <div
                        aria-hidden="true"
                        className="playback-cursor"
                        ref={cursorRef}
                        style={{
                            left: 0,
                            top: 0,
                            height: 0,
                            visibility: "hidden",
                        }}
                    />
                )}
            </div>
        </div>
    );
}
