import { useEffect, useRef, useState } from "react";

import FileDropzone from "./components/FileDropzone";
import ScoreViewer from "./components/ScoreViewer";

import {
    createProject,
    deleteProject,
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

function projectDate(value) {
    if (!value) return "";
    const date = new Date(`${value.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: date.getFullYear() === new Date().getFullYear()
            ? undefined
            : "numeric",
    }).format(date);
}

export default function App() {
    const [file, setFile] = useState(null);
    const [projects, setProjects] = useState([]);
    const [activeProject, setActiveProject] = useState(null);
    const [score, setScore] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [analysisError, setAnalysisError] = useState("");
    const [routeProjectId, setRouteProjectId] = useState(projectIdFromLocation);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [isDeletingProject, setIsDeletingProject] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [projectsError, setProjectsError] = useState("");
    const [projectLoadError, setProjectLoadError] = useState(null);
    const [error, setError] = useState("");
    const [deleteError, setDeleteError] = useState("");
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
        if (!isImportModalOpen) return undefined;

        function handleKeyDown(event) {
            if (event.key === "Escape" && !isImporting) {
                setIsImportModalOpen(false);
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isImportModalOpen, isImporting]);

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
                setDeleteError("");
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

    const visibleProjects = projects.filter(project =>
        `${project.name} ${project.source_filename}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())
    );
    const currentProject = activeProject?.id === routeProjectId
        ? activeProject
        : null;

    function openProject(project) {
        window.history.pushState(null, "", projectPath(project));
        setProjectLoadError(null);
        setRouteProjectId(project.id);
    }

    function showProjects() {
        window.history.pushState(null, "", "/");
        setProjectLoadError(null);
        setRouteProjectId(null);
        setActiveProject(null);
        setScore(null);
        setAnalysis(null);
        setAnalysisError("");
        setDeleteError("");
        setFile(null);
        setError("");
    }

    async function handleDeleteProject() {
        if (!currentProject || isDeletingProject) return;

        const confirmed = window.confirm(
            `Delete "${currentProject.name}" and its saved MusicXML snapshots? This cannot be undone.`
        );
        if (!confirmed) return;

        setIsDeletingProject(true);
        setDeleteError("");

        try {
            await deleteProject(currentProject.id);
            setProjects(current =>
                current.filter(project => project.id !== currentProject.id)
            );
            showProjects();
        } catch (deleteRequestError) {
            setDeleteError(deleteRequestError.message);
        } finally {
            setIsDeletingProject(false);
        }
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
            setIsImportModalOpen(false);
            setSearch("");
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
        <div className={`app-shell ${routeProjectId ? "project-view" : ""}`}>
            {!routeProjectId && (
                <aside className="sidebar">
                    <button className="brand" onClick={showProjects}>
                        <span className="brand-icon">♪</span>
                        <span>Music Toolkit</span>
                    </button>

                    <button
                        className="btn-primary sidebar-import"
                        onClick={() => {
                            setError("");
                            setIsImportModalOpen(true);
                        }}
                    >
                        <span aria-hidden="true">+</span> Import Score
                    </button>

                    <nav className="sidebar-section" aria-label="Workspace">
                        <div className="sidebar-label">Workspace</div>
                        <button
                            className={`nav-item ${
                                !routeProjectId ? "active" : ""
                            }`}
                            onClick={showProjects}
                        >
                            <span>All Scores</span>
                            <span className="nav-count">{projects.length}</span>
                        </button>
                        <button className="nav-item nav-placeholder" disabled>
                            <span>Recent Edits</span>
                        </button>

                        <div className="sidebar-label quick-open-label">
                            Quick Open
                        </div>
                        {projects.slice(0, 5).map(project => (
                            <button
                                className={`nav-item quick-open-item ${
                                    project.id === routeProjectId ? "active" : ""
                                }`}
                                key={project.id}
                                title={project.name}
                                onClick={() => openProject(project)}
                            >
                                <span>{project.name}</span>
                            </button>
                        ))}
                        {!isLoadingProjects && projects.length === 0 && (
                            <p className="sidebar-empty">No projects yet</p>
                        )}
                    </nav>
                    <div className="sidebar-footer">Music Toolkit</div>
                </aside>
            )}

            <div className="main-content">
                <header className="app-header">
                    <div className="breadcrumb">
                        {routeProjectId ? (
                            <button
                                className="back-to-dashboard"
                                onClick={showProjects}
                            >
                                <span aria-hidden="true">←</span>
                                Dashboard
                            </button>
                        ) : (
                            <button onClick={showProjects}>Music Toolkit</button>
                        )}
                        {!routeProjectId && <span aria-hidden="true">/</span>}
                        {currentProject ? (
                            <strong title={currentProject.name}>
                                {currentProject.name}
                            </strong>
                        ) : (
                            <strong>Score Library</strong>
                        )}
                    </div>
                    <label className="search-wrap">
                        <span className="search-icon" aria-hidden="true">⌕</span>
                        <input
                            className="search-box"
                            type="search"
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder="Search scores..."
                            aria-label="Search scores"
                        />
                    </label>
                </header>

                <main className="workspace">
                    {!routeProjectId && (
                        <>
                            <div className="section-header">
                                <div>
                                    <h1>Projects</h1>
                                    <p className="section-description">
                                        Your music scores, all in one place.
                                    </p>
                                </div>
                                <button
                                    className="btn-primary"
                                    onClick={() => {
                                        setError("");
                                        setIsImportModalOpen(true);
                                    }}
                                >
                                    <span aria-hidden="true">+</span> Import Score
                                </button>
                            </div>

                            {projectsError && (
                                <p className="error-message">{projectsError}</p>
                            )}
                            {isLoadingProjects ? (
                                <p className="library-message">Loading projects...</p>
                            ) : visibleProjects.length ? (
                                <div className="project-grid">
                                    {visibleProjects.map(project => (
                                        <button
                                            className="project-card"
                                            key={project.id}
                                            onClick={() => openProject(project)}
                                        >
                                            <div className="card-preview" aria-hidden="true">
                                                <span className="badge-rev">
                                                    Rev {project.current_revision}
                                                </span>
                                                <div className="staff-lines" />
                                                <div className="staff-lines" />
                                                <div className="staff-lines" />
                                            </div>
                                            <div className="card-body">
                                                <h2 className="card-title">
                                                    {project.name}
                                                </h2>
                                                <div className="card-meta">
                                                    <span title={project.source_filename}>
                                                        {project.source_filename}
                                                    </span>
                                                    <span>{projectDate(project.updated_at)}</span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-library">
                                    <span className="empty-library-icon" aria-hidden="true">
                                        ♪
                                    </span>
                                    <h2>
                                        {search.trim()
                                            ? "No matching scores"
                                            : "Your score library is empty"}
                                    </h2>
                                    <p>
                                        {search.trim()
                                            ? "Try another search."
                                            : "Import a MusicXML file to create your first project."}
                                    </p>
                                    {!search.trim() && (
                                        <button
                                            className="btn-primary"
                                            onClick={() => setIsImportModalOpen(true)}
                                        >
                                            <span aria-hidden="true">+</span> Import Score
                                        </button>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {routeProjectId &&
                        !currentProject &&
                        projectLoadError?.id !== routeProjectId && (
                            <p className="library-message">Loading project...</p>
                        )}

                    {routeProjectId &&
                        projectLoadError?.id === routeProjectId && (
                            <section className="project-error">
                                <p className="error-message">
                                    {projectLoadError.message}
                                </p>
                                <button className="btn-ghost" onClick={showProjects}>
                                    Back to projects
                                </button>
                            </section>
                        )}

                    {currentProject && score && (
                        <section className="detail-page">
                            <div className="detail-heading">
                                <div>
                                    <div className="detail-title-row">
                                        <h1>{currentProject.name}</h1>
                                        <span className="revision-badge">
                                            Revision {currentProject.current_revision}
                                        </span>
                                    </div>
                                    <p className="detail-filename">
                                        {currentProject.source_filename}
                                    </p>
                                </div>
                                <div className="detail-actions">
                                    <a
                                        className="btn-primary export-button"
                                        href={projectExportUrl(currentProject.id)}
                                    >
                                        <span aria-hidden="true">↓</span>
                                        Export MusicXML
                                    </a>
                                    <button
                                        className="btn-danger delete-project-button"
                                        disabled={isDeletingProject}
                                        onClick={handleDeleteProject}
                                    >
                                        <span aria-hidden="true">⌫</span>
                                        {isDeletingProject ? "Deleting..." : "Delete"}
                                    </button>
                                </div>
                            </div>

                            {deleteError && (
                                <p className="error-message" role="alert">
                                    {deleteError}
                                </p>
                            )}
                            <section className="score-section">
                                <ScoreViewer
                                    key={currentProject.id}
                                    pages={score.pages}
                                    midiBase64={score.midi_base64}
                                    timeline={score.timeline}
                                    analysis={analysis}
                                    analysisError={analysisError}
                                />
                            </section>
                        </section>
                    )}
                </main>
            </div>

            {isImportModalOpen && (
                <div
                    className="modal-overlay"
                    onClick={() => !isImporting && setIsImportModalOpen(false)}
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
                                onClick={() => setIsImportModalOpen(false)}
                            >
                                ×
                            </button>
                        </div>

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
                        <p className="modal-hint">
                            Saved as Revision 1 when imported.
                        </p>
                        {error && <p className="error-message">{error}</p>}

                        <div className="modal-actions">
                            <button
                                className="btn-ghost"
                                disabled={isImporting}
                                onClick={() => setIsImportModalOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-primary"
                                disabled={!file || isImporting}
                                onClick={handleImport}
                            >
                                {isImporting ? "Importing..." : "Import & Save Project"}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
