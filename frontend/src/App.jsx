import { useEffect, useRef, useState } from "react";

import FileDropzone from "./components/FileDropzone";
import ScoreViewer from "./components/ScoreViewer";

import {
    createProject,
    getProject,
    listProjects,
    projectExportUrl,
} from "./services/scoreApi";

import "./App.css";
import "./style.css";

function projectIdFromLocation() {
    const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

function projectSlug(name) {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "score";
}

function projectPath(project) {
    return `/projects/${encodeURIComponent(project.id)}/${projectSlug(project.name)}`;
}

export default function App() {
    const [file, setFile] = useState(null);
    const [projects, setProjects] = useState([]);
    const [activeProject, setActiveProject] = useState(null);
    const [score, setScore] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [analysisError, setAnalysisError] = useState("");
    const [analysisVisible, setAnalysisVisible] = useState(false);
    const [routeProjectId, setRouteProjectId] = useState(projectIdFromLocation);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [projectsError, setProjectsError] = useState("");
    const [projectLoadError, setProjectLoadError] = useState(null);
    const [error, setError] = useState("");
    const skipNextProjectLoad = useRef(null);

    useEffect(() => {
        let cancelled = false;
        listProjects()
            .then(result => {
                if (!cancelled) setProjects(result.projects);
            })
            .catch(loadError => {
                if (!cancelled) setProjectsError(loadError.message);
            })
            .finally(() => {
                if (!cancelled) setIsLoadingProjects(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        function handlePopState() {
            setProjectLoadError(null);
            setRouteProjectId(projectIdFromLocation());
        }

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    useEffect(() => {
        if (!routeProjectId) return undefined;

        if (skipNextProjectLoad.current === routeProjectId) {
            skipNextProjectLoad.current = null;
            return undefined;
        }

        let cancelled = false;
        getProject(routeProjectId)
            .then(result => {
                if (cancelled) return;
                setActiveProject(result.project);
                setScore(result.score);
                setAnalysis(result.analysis);
                setAnalysisError(result.analysis_error || "");
                setAnalysisVisible(false);
            })
            .catch(loadError => {
                if (!cancelled) {
                    setProjectLoadError({
                        id: routeProjectId,
                        message: loadError.message,
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [routeProjectId]);

    function openProject(project) {
        window.history.pushState(null, "", projectPath(project));
        setProjectLoadError(null);
        setRouteProjectId(project.id);
    }

    function showProjects() {
        window.history.pushState(null, "", "/");
        setProjectLoadError(null);
        setRouteProjectId(null);
        setFile(null);
        setError("");
    }

    async function handleImport() {
        if (!file || isImporting) return;

        setIsImporting(true);
        setError("");

        try {
            const result = await createProject(file);
            setProjects(current => [
                result.project,
                ...current.filter(project => project.id !== result.project.id),
            ]);
            setActiveProject(result.project);
            setScore(result.score);
            setAnalysis(result.analysis);
            setAnalysisError(result.analysis_error || "");
            skipNextProjectLoad.current = result.project.id;
            setProjectLoadError(null);
            window.history.pushState(null, "", projectPath(result.project));
            setRouteProjectId(result.project.id);
            setFile(null);
        } catch (importError) {
            setError(importError.message);
        } finally {
            setIsImporting(false);
        }
    }

    return (
        <>
            <header className="app-header">
                <h1>Music Toolkit</h1>
                <span>Score Viewer</span>
            </header>

            <main className="app">
                {!routeProjectId && (
                    <>
                        <section className="workspace">
                            <h2>Import a score</h2>
                            <p>
                                Import a MusicXML file to create a project. The
                                original file is saved as revision 1.
                            </p>

                            <FileDropzone
                                file={file}
                                onFileSelect={selectedFile => {
                                    setFile(selectedFile);
                                    setError("");
                                }}
                                onRemove={() => {
                                    setFile(null);
                                    setError("");
                                }}
                                disabled={isImporting}
                            />

                            <button
                                className="process-button"
                                disabled={!file || isImporting}
                                onClick={handleImport}
                            >
                                {isImporting ? "Importing..." : "Import & Save Project"}
                            </button>

                            {error && <p className="error-message">{error}</p>}
                        </section>

                        <section className="projects-section">
                            <h2>Projects</h2>
                            {projectsError && (
                                <p className="error-message">{projectsError}</p>
                            )}
                            {isLoadingProjects ? (
                                <p>Loading projects...</p>
                            ) : projects.length ? (
                                <ul className="project-list">
                                    {projects.map(project => (
                                        <li key={project.id}>
                                            <button
                                                className="project-list-item"
                                                onClick={() => openProject(project)}
                                            >
                                                <span>
                                                    <strong>{project.name}</strong>
                                                    <small>{project.source_filename}</small>
                                                </span>
                                                <span className="project-revision">
                                                    Revision {project.current_revision}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p>No saved projects yet.</p>
                            )}
                        </section>
                    </>
                )}

                {routeProjectId &&
                    activeProject?.id !== routeProjectId &&
                    projectLoadError?.id !== routeProjectId && (
                    <p className="project-status">Loading project...</p>
                )}

                {routeProjectId && projectLoadError?.id === routeProjectId && (
                    <section className="project-status">
                        <p className="error-message">
                            {projectLoadError.message}
                        </p>
                        <button className="utility-button" onClick={showProjects}>
                            Back to projects
                        </button>
                    </section>
                )}

                {activeProject?.id === routeProjectId && score && (
                    <>
                        <section className="workspace workspace-compact">
                            <div className="current-project">
                                <strong>{activeProject.name}</strong>
                                <small>
                                    {activeProject.source_filename} · Revision{" "}
                                    {activeProject.current_revision}
                                </small>
                            </div>
                            <div className="project-actions">
                                <a
                                    className="utility-button"
                                    href={projectExportUrl(activeProject.id)}
                                >
                                    Export MusicXML
                                </a>
                                <button
                                    className="utility-button"
                                    onClick={showProjects}
                                >
                                    Projects
                                </button>
                            </div>
                        </section>

                        <section className="score-section">
                            <div className="score-section-header">
                                <h2>{activeProject.name}</h2>
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
                                key={activeProject.id}
                                pages={score.pages}
                                midiBase64={score.midi_base64}
                                timeline={score.timeline}
                            />
                        </section>
                    </>
                )}
            </main>
        </>
    );
}
