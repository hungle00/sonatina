import ScoreViewer from "./ScoreViewer";
import LoadingSpinner from "./LoadingSpinner";
import { projectExportUrl } from "../services/scoreApi";

export default function ProjectDetail({
    project,
    score,
    analysis,
    analysisError,
    isDeletingProject,
    isTransposing,
    transposeError,
    isUndoing,
    undoError,
    deleteError,
    onDelete,
    onTranspose,
    onUndo,
}) {
    return (
        <section className="detail-page">
            <div className="detail-heading">
                <div>
                    <div className="detail-title-row">
                        <h1>{project.name}</h1>
                        <span className="revision-badge">
                            Revision {project.current_revision}
                        </span>
                    </div>
                    <p className="detail-filename">{project.source_filename}</p>
                </div>
                <div className="detail-actions">
                    <a
                        className="btn-primary export-button"
                        href={projectExportUrl(project.id)}
                    >
                        <span aria-hidden="true">↓</span>
                        Export MusicXML
                    </a>
                    <button
                        className="btn-danger delete-project-button"
                        disabled={isDeletingProject}
                        onClick={onDelete}
                    >
                        <span aria-hidden="true">⌫</span>
                        {isDeletingProject ? (
                            <LoadingSpinner label="Deleting..." />
                        ) : (
                            "Delete"
                        )}
                    </button>
                </div>
            </div>
            {deleteError && (
                <p className="error-message" role="alert">{deleteError}</p>
            )}
            <section className="score-section">
                <ScoreViewer
                    key={`${project.id}-${project.current_revision}`}
                    pages={score.pages}
                    midiBase64={score.midi_base64}
                    timeline={score.timeline}
                    analysis={analysis}
                    analysisError={analysisError}
                    isTransposing={isTransposing}
                    transposeError={transposeError}
                    onTranspose={onTranspose}
                    canUndo={project.can_undo}
                    isUndoing={isUndoing}
                    undoError={undoError}
                    onUndo={onUndo}
                />
            </section>
        </section>
    );
}
