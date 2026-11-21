import ScoreProperties from "./ScoreProperties";
import TransposeControls from "./TransposeControls";

export default function ScoreInspector({
    analysis,
    analysisError,
    isTransposing,
    transposeError,
    activeTab,
    onTabChange,
    onTranspose,
    onClose,
}) {
    function handleTabKeyDown(event) {
        let nextTab;

        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            nextTab = activeTab === "properties" ? "editor-tools" : "properties";
        } else if (event.key === "Home") {
            nextTab = "properties";
        } else if (event.key === "End") {
            nextTab = "editor-tools";
        }

        if (nextTab) {
            event.preventDefault();
            onTabChange(nextTab);
            document.getElementById(`${nextTab}-tab`)?.focus();
        }
    }

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
            <div className="sidebar-tabs" role="tablist" aria-label="Inspector">
                <button
                    id="properties-tab"
                    className={`sidebar-tab ${
                        activeTab === "properties" ? "active" : ""
                    }`}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "properties"}
                    tabIndex={activeTab === "properties" ? 0 : -1}
                    aria-controls="inspector-panel"
                    onClick={() => onTabChange("properties")}
                    onKeyDown={handleTabKeyDown}
                >
                    Properties
                </button>
                <button
                    id="editor-tools-tab"
                    className={`sidebar-tab ${
                        activeTab === "editor-tools" ? "active" : ""
                    }`}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "editor-tools"}
                    tabIndex={activeTab === "editor-tools" ? 0 : -1}
                    aria-controls="inspector-panel"
                    onClick={() => onTabChange("editor-tools")}
                    onKeyDown={handleTabKeyDown}
                >
                    Editor Tools
                </button>
            </div>
            <div
                className="sidebar-content"
                id="inspector-panel"
                role="tabpanel"
                aria-labelledby={
                    activeTab === "properties"
                        ? "properties-tab"
                        : "editor-tools-tab"
                }
            >
                {activeTab === "properties" ? (
                    <ScoreProperties
                        analysis={analysis}
                        analysisError={analysisError}
                    />
                ) : (
                    <>
                        <TransposeControls
                            analysis={analysis}
                            isTransposing={isTransposing}
                            transposeError={transposeError}
                            onTranspose={onTranspose}
                        />
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
                    </>
                )}
            </div>
        </aside>
    );
}
