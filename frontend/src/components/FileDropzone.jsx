import { useRef, useState } from "react";
import "../styles/dropzone.css";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".musicxml", ".xml"];

function validateFile(file) {
    const extension = file.name
        .slice(file.name.lastIndexOf("."))
        .toLowerCase();

    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
        return "Please select a MusicXML file (.musicxml or .xml).";
    }

    if (file.size > MAX_FILE_SIZE) {
        return "File size must be smaller than 15 MB.";
    }

    if (file.size === 0) {
        return "This file is empty.";
    }

    return null;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FileDropzone({
    file,
    onFileSelect,
    onRemove,
    disabled = false,
}) {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState("");

    function selectFile(selectedFile) {
        if (!selectedFile) return;

        const validationError = validateFile(selectedFile);

        if (validationError) {
            setError(validationError);
            return;
        }

        setError("");
        onFileSelect(selectedFile);
    }

    function handleDrop(event) {
        event.preventDefault();
        setDragging(false);

        if (disabled) return;

        selectFile(event.dataTransfer.files[0]);
    }

    function handleInputChange(event) {
        selectFile(event.target.files[0]);

        // Allow selecting the same file again.
        event.target.value = "";
    }

    return (
        <div className="upload-wrapper">
            {!file ? (
                <div
                    className={`dropzone ${dragging ? "dragging" : ""} ${
                        disabled ? "disabled" : ""
                    }`}
                    onClick={() => !disabled && inputRef.current?.click()}
                    onDragOver={(event) => {
                        event.preventDefault();
                        if (!disabled) setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    onKeyDown={(event) => {
                        if (
                            !disabled &&
                            (event.key === "Enter" || event.key === " ")
                        ) {
                            event.preventDefault();
                            inputRef.current?.click();
                        }
                    }}
                >
                    <div className="dropzone-icon">↑</div>

                    <h3>Drop your score here</h3>

                    <p>
                        Drag and drop a MusicXML file, or{" "}
                        <span>browse files</span>
                    </p>

                    <small>Supported: .musicxml, .xml · Max 15 MB</small>

                    <input
                        ref={inputRef}
                        type="file"
                        accept=".musicxml,.xml"
                        hidden
                        onChange={handleInputChange}
                        disabled={disabled}
                    />
                </div>
            ) : (
                <div className="selected-file">
                    <div className="file-icon">♫</div>

                    <div className="file-info">
                        <strong>{file.name}</strong>
                        <small>{formatFileSize(file.size)}</small>
                    </div>

                    <button
                        type="button"
                        className="remove-file"
                        onClick={onRemove}
                        disabled={disabled}
                    >
                        Remove
                    </button>
                </div>
            )}

            {error && <p className="upload-error">{error}</p>}
        </div>
    );
}
