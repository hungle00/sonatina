import { useRef, useState } from "react";
import "../styles/dropzone.css";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const FILE_TYPES = {
    musicxml: {
        accept: ".musicxml,.xml",
        extensions: [".musicxml", ".xml"],
        description: "MusicXML (.musicxml or .xml)",
    },
    omr: {
        accept: ".pdf,.png,.jpg,.jpeg",
        extensions: [".pdf", ".png", ".jpg", ".jpeg"],
        description: "PDF or image (.pdf, .png, .jpg, .jpeg)",
    },
};

function validateFile(file, fileType) {
    const extension = file.name
        .slice(file.name.lastIndexOf("."))
        .toLowerCase();
    const acceptedType = FILE_TYPES[fileType];

    if (!acceptedType.extensions.includes(extension)) {
        return `Please select a ${acceptedType.description} file.`;
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
    fileType = "musicxml",
    disabled = false,
}) {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState("");

    function selectFile(selectedFile) {
        if (!selectedFile) return;

        const validationError = validateFile(selectedFile, fileType);

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
                        Drag and drop a {FILE_TYPES[fileType].description} file, or{" "}
                        <span>browse files</span>
                    </p>

                    <small>
                        Supported: {FILE_TYPES[fileType].extensions.join(", ")} · Max 15 MB
                    </small>

                    <input
                        ref={inputRef}
                        type="file"
                        accept={FILE_TYPES[fileType].accept}
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
