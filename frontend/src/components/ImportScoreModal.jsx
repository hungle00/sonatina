import FileDropzone from "./FileDropzone";
import LoadingSpinner from "./LoadingSpinner";

export default function ImportScoreModal({
    file,
    error,
    isImporting,
    onClose,
    onImport,
    onFileSelect,
    onRemoveFile,
}) {
    return (
        <div
            className="modal-overlay"
            onClick={() => !isImporting && onClose()}
        >
            <section
                className="modal-box import-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-modal-title"
                onClick={event => event.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 id="import-modal-title">Import a score</h2>
                    <button
                        className="btn-close"
                        aria-label="Close import dialog"
                        disabled={isImporting}
                        onClick={onClose}
                    >
                        ×
                    </button>
                </div>
                <FileDropzone
                    file={file}
                    onFileSelect={onFileSelect}
                    onRemove={onRemoveFile}
                    disabled={isImporting}
                />
                <p className="modal-hint">
                    Saved as Revision 1 when imported.
                </p>
                {error && <p className="error-message">{error}</p>}
                <div className="modal-actions">
                    <button
                        className="btn-ghost"
                        disabled={isImporting}
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn-primary"
                        disabled={!file || isImporting}
                        onClick={onImport}
                    >
                        {isImporting ? (
                            <LoadingSpinner label="Importing..." />
                        ) : (
                            "Import & Save Project"
                        )}
                    </button>
                </div>
            </section>
        </div>
    );
}
