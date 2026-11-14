import { useState } from "react";

import FileDropzone from "./components/FileDropzone";
import ScoreViewer from "./components/ScoreViewer";

import {
    renderScore,
    analyzeScore,
} from "./services/scoreApi";

import "./App.css";
import "./style.css";

export default function App() {
    const [file, setFile] = useState(null);
    const [score, setScore] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [analysisError, setAnalysisError] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showUploadForm, setShowUploadForm] = useState(true);
    const [analysisVisible, setAnalysisVisible] = useState(false);

    function removeFile() {
        setFile(null);
        setScore(null);
        setAnalysis(null);
        setAnalysisError("");
        setError("");
        setShowUploadForm(true);
        setAnalysisVisible(false);
    }

    async function handleProcess() {
        if (!file || loading) return;

        setLoading(true);
        setError("");
        setScore(null);
        setAnalysis(null);
        setAnalysisError("");
        setAnalysisVisible(false);

        try {
            const [renderResult, analyzeResult] = await Promise.allSettled([
                renderScore(file),
                analyzeScore(file),
            ]);

            if (renderResult.status === "fulfilled") {
                setScore(renderResult.value);
                setShowUploadForm(false);
            } else {
                setError(renderResult.reason.message);
            }

            if (analyzeResult.status === "fulfilled") {
                setAnalysis(analyzeResult.value);
            } else {
                setAnalysisError(analyzeResult.reason.message);
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <header className="app-header">
                <h1>Music Toolkit</h1>
                <span>Score Viewer</span>
            </header>

            <main className="app">
                {score && !showUploadForm ? (
                    <section className="workspace workspace-compact">
                        <span className="current-file">{file?.name}</span>
                        <button
                            className="utility-button"
                            onClick={() => {
                                setFile(null);
                                setShowUploadForm(true);
                            }}
                        >
                            Change score
                        </button>
                    </section>
                ) : (
                    <section className="workspace">
                        <h2>Open a score</h2>
                        <p>Upload a MusicXML file to view and analyze your score.</p>

                        <FileDropzone
                            file={file}
                            onFileSelect={(selectedFile) => {
                                setFile(selectedFile);
                                setScore(null);
                                setAnalysis(null);
                                setAnalysisVisible(false);
                                setError("");
                                setAnalysisError("");
                            }}
                            onRemove={removeFile}
                            disabled={loading}
                        />

                        <button
                            className="process-button"
                            disabled={!file || loading}
                            onClick={handleProcess}
                        >
                            {loading ? "Processing..." : "Render & Analyze"}
                        </button>

                        {error && <p className="error-message">{error}</p>}
                        {analysisError && (
                            <p className="error-message">
                                Analysis failed: {analysisError}
                            </p>
                        )}
                    </section>
                )}

                {score && (
                    <section className="score-section">
                        <div className="score-section-header">
                            <h2>{score.filename}</h2>
                            {analysis && (
                                <button
                                    className="utility-button"
                                    onClick={() =>
                                        setAnalysisVisible(visible => !visible)
                                    }
                                >
                                    {analysisVisible ? "Hide analysis" : "Analysis"}
                                </button>
                            )}
                        </div>

                        {analysis && analysisVisible && (
                            <section className="analysis-panel">
                                <h3>Score Analysis</h3>
                                <div className="analysis-grid">
                                    <div>
                                        <small>Key</small>
                                        <strong>{analysis.key}</strong>
                                    </div>
                                    <div>
                                        <small>Parts</small>
                                        <strong>{analysis.parts}</strong>
                                    </div>
                                    {analysis.notes != null && (
                                        <div>
                                            <small>Notes</small>
                                            <strong>{analysis.notes}</strong>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {analysisError && (
                            <p className="error-message">
                                Analysis failed: {analysisError}
                            </p>
                        )}

                        <ScoreViewer
                            pages={score.pages}
                            midiBase64={score.midi_base64}
                            timeline={score.timeline}
                        />
                    </section>
                )}
            </main>
        </>
    );
}
