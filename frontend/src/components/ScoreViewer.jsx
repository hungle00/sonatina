import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";

import ScoreCanvas from "./ScoreCanvas";
import ScoreInspector from "./ScoreInspector";
import ScoreToolbar from "./ScoreToolbar";
import { LoadingOverlay } from "./LoadingSpinner";
import useMidiPlayback from "../hooks/useMidiPlayback";

export default function ScoreViewer({
    pages,
    midiBase64,
    timeline,
    analysis,
    analysisError,
    isTransposing,
    transposeError,
    onTranspose,
    canUndo,
    isUndoing,
    undoError,
    onUndo,
}) {
    const [page, setPage] = useState(0);
    const [zoom, setZoom] = useState(100);
    const [inspectorVisible, setInspectorVisible] = useState(false);
    const [inspectorTab, setInspectorTab] = useState("properties");
    const scoreContainerRef = useRef(null);
    const scorePageRef = useRef(null);
    const scoreSvgRef = useRef(null);
    const cursorElementRef = useRef(null);
    const cursorSegmentRef = useRef(null);
    const previousPageRef = useRef(page);

    const svg = useMemo(() => {
        if (!pages?.[page]) return "";

        return DOMPurify.sanitize(pages[page], {
            USE_PROFILES: {
                svg: true,
                svgFilters: true,
            },
            ADD_TAGS: ["use"],
        });
    }, [pages, page]);

    function updatePlaybackCursor(scoreTimeMs) {
        const cursorSegment = cursorSegmentRef.current;
        if (!cursorSegment || cursorSegment.page !== page) {
            return;
        }

        const duration =
            cursorSegment.endTimeMs - cursorSegment.startTimeMs;
        const progress = duration > 0
            ? Math.max(
                0,
                Math.min(
                    1,
                    (scoreTimeMs - cursorSegment.startTimeMs) / duration
                )
            )
            : 1;
        const left =
            cursorSegment.startLeft +
            (cursorSegment.endLeft - cursorSegment.startLeft) * progress;

        if (cursorElementRef.current) {
            cursorElementRef.current.style.left = `${left}px`;
        }
    }

    const {
        changeTempo,
        cursorAnchor,
        isPlaying,
        playbackError,
        playMidi,
        seekToMeasure,
        stopPlayback,
        tempoPercent,
    } = useMidiPlayback({
        midiBase64,
        timeline,
        pageCount: pages.length,
        onPageChange: setPage,
        onPlaybackTick: updatePlaybackCursor,
    });

    useEffect(() => {
        if (previousPageRef.current !== page) {
            scoreContainerRef.current?.scrollTo({ top: 0, left: 0 });
            previousPageRef.current = page;
        }
    }, [page]);

    useEffect(() => {
        if (!isPlaying || !cursorAnchor || cursorAnchor.page !== page) {
            cursorSegmentRef.current = null;
            return;
        }

        const pageElement = scorePageRef.current;
        const scoreSvg = scoreSvgRef.current;
        const scoreContainer = scoreContainerRef.current;
        const cursorElement = cursorElementRef.current;

        if (!pageElement || !scoreSvg || !scoreContainer || !cursorElement) {
            cursorSegmentRef.current = null;
            return;
        }

        const elements = Array.from(scoreSvg.querySelectorAll("[id]"));
        const target = elements.find(
            element => element.id === cursorAnchor.cursor_id
        );

        if (!target) {
            cursorSegmentRef.current = null;
            cursorElement.style.visibility = "hidden";
            return;
        }

        const systemGroup = target.closest("g.system");
        if (!systemGroup) {
            cursorSegmentRef.current = null;
            cursorElement.style.visibility = "hidden";
            return;
        }

        const nextTarget = cursorAnchor.next_cursor_id
            ? elements.find(
                element => element.id === cursorAnchor.next_cursor_id
            )
            : null;
        const sameSystem = nextTarget?.closest("g.system") === systemGroup;
        const pageBounds = pageElement.getBoundingClientRect();
        const targetBounds = target.getBoundingClientRect();
        const systemBounds = systemGroup.getBoundingClientRect();
        const containerBounds = scoreContainer.getBoundingClientRect();
        const targetCenter = targetBounds.top + targetBounds.height / 2;
        const systemLeft = systemBounds.left - pageBounds.left;
        const systemRight = systemBounds.right - pageBounds.left;
        const startLeft = Math.min(
            systemRight,
            Math.max(
                systemLeft,
                targetBounds.left + targetBounds.width / 2 - pageBounds.left
            )
        );
        const nextBounds = nextTarget?.getBoundingClientRect();
        const endLeft = sameSystem && nextBounds
            ? Math.min(
                systemRight,
                Math.max(
                    systemLeft,
                    nextBounds.left + nextBounds.width / 2 - pageBounds.left
                )
            )
            : startLeft;

        cursorElement.style.left = `${startLeft}px`;
        cursorElement.style.top = `${systemBounds.top - pageBounds.top}px`;
        cursorElement.style.height = `${systemBounds.height}px`;
        cursorElement.style.visibility = "visible";
        cursorSegmentRef.current = {
            page,
            startTimeMs: cursorAnchor.time_ms,
            endTimeMs: cursorAnchor.next_time_ms ?? cursorAnchor.time_ms,
            startLeft,
            endLeft,
        };

        if (
            targetBounds.top < containerBounds.top ||
            targetBounds.bottom > containerBounds.bottom
        ) {
            scoreContainer.scrollTo({
                top: Math.max(
                    0,
                    scoreContainer.scrollTop +
                        targetCenter -
                        containerBounds.top -
                        scoreContainer.clientHeight / 2
                ),
                behavior: "smooth",
            });
        }

        if (
            targetBounds.left < containerBounds.left ||
            targetBounds.right > containerBounds.right
        ) {
            scoreContainer.scrollTo({
                left: Math.max(
                    0,
                    scoreContainer.scrollLeft +
                        targetBounds.left +
                        targetBounds.width / 2 -
                        containerBounds.left -
                        scoreContainer.clientWidth / 2
                ),
                behavior: "smooth",
            });
        }
    }, [cursorAnchor, isPlaying, page, svg, zoom]);

    function handleScoreClick(event) {
        const measure = event.target.closest("g.measure[id]");
        if (measure && event.currentTarget.contains(measure)) {
            seekToMeasure(measure.id);
        }
    }

    return (
        <div className="viewer">
            <ScoreToolbar
                isPlaying={isPlaying}
                midiAvailable={Boolean(midiBase64)}
                onPlay={() => void playMidi()}
                onStop={stopPlayback}
                tempoPercent={tempoPercent}
                onTempoChange={changeTempo}
                page={page}
                pageCount={pages.length}
                onPageStep={step => {
                    setPage(currentPage => currentPage + step);
                }}
                zoom={zoom}
                onZoomChange={setZoom}
                inspectorVisible={inspectorVisible}
                editorMode={
                    inspectorVisible && inspectorTab === "editor-tools"
                }
                canUndo={canUndo}
                isUndoing={isUndoing}
                isTransposing={isTransposing}
                onInspectorToggle={() =>
                    setInspectorVisible(visible => !visible)
                }
                onUndo={onUndo}
                playbackError={playbackError}
                undoError={undoError}
            />
            <div
                className={`viewer-content ${
                    inspectorVisible ? "" : "inspector-hidden"
                }`}
            >
                <div
                    className="score-viewer-stage"
                    aria-busy={isTransposing || isUndoing}
                >
                    <ScoreCanvas
                        containerRef={scoreContainerRef}
                        pageRef={scorePageRef}
                        svgRef={scoreSvgRef}
                        cursorRef={cursorElementRef}
                        svg={svg}
                        zoom={zoom}
                        onClick={handleScoreClick}
                        isPlaying={isPlaying}
                        cursorVisible={cursorAnchor?.page === page}
                    />
                    {(isTransposing || isUndoing) && (
                        <LoadingOverlay
                            label={
                                isUndoing
                                    ? "Undoing score edit..."
                                    : "Transposing score..."
                            }
                        />
                    )}
                </div>
                {inspectorVisible && (
                    <ScoreInspector
                        analysis={analysis}
                        analysisError={analysisError}
                        isTransposing={isTransposing}
                        transposeError={transposeError}
                        activeTab={inspectorTab}
                        onTabChange={setInspectorTab}
                        onTranspose={onTranspose}
                        onClose={() => setInspectorVisible(false)}
                    />
                )}
            </div>
        </div>
    );
}
