import { useState } from "react";
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
    const [fileType, setFileType] = useState("musicxml");

    function selectFileType(nextFileType) {
        if (nextFileType === fileType || isImporting) return;
        onRemoveFile();
        setFileType(nextFileType);
    }

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
                <div className="import-tabs" aria-label="Score file type">
                    <button
                        type="button"
                        className={`import-tab ${
                            fileType === "musicxml" ? "active" : ""
                        }`}
                        aria-pressed={fileType === "musicxml"}
                        disabled={isImporting}
                        onClick={() => selectFileType("musicxml")}
                    >
                        MusicXML
                    </button>
                    <button
                        type="button"
                        className={`import-tab ${
                            fileType === "omr" ? "active" : ""
                        }`}
                        aria-pressed={fileType === "omr"}
                        disabled={isImporting}
                        onClick={() => selectFileType("omr")}
                    >
                        PDF / Image
                    </button>
                </div>
                <FileDropzone
                    file={file}
                    onFileSelect={onFileSelect}
                    onRemove={onRemoveFile}
                    fileType={fileType}
                    disabled={isImporting}
                />
                <p className="modal-hint">
                    {fileType === "omr"
                        ? "The score will be converted to MusicXML and saved as Revision 1."
                        : "Saved as Revision 1 when imported."}
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
                        onClick={() => onImport(fileType)}
                    >
                        {isImporting ? (
                            <LoadingSpinner
                                label={fileType === "omr" ? "Converting..." : "Importing..."}
                            />
                        ) : (
                            fileType === "omr"
                                ? "Convert & Save Project"
                                : "Import & Save Project"
                        )}
                    </button>
                </div>
            </section>
        </div>
    );
}
