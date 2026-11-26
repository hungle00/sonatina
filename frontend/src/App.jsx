import { useEffect, useRef, useState } from "react";

import AppHeader from "./components/AppHeader";
import ImportScoreModal from "./components/ImportScoreModal";
import LoadingSpinner from "./components/LoadingSpinner";
import ProjectDetail from "./components/ProjectDetail";
import ProjectLibrary from "./components/ProjectLibrary";
import WorkspaceSidebar from "./components/WorkspaceSidebar";

import {
    createProject,
    convertScore,
    deleteProject,
    getProject,
    listProjects,
    transposeProject,
    undoProject,
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
    const [routeProjectId, setRouteProjectId] = useState(projectIdFromLocation);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [isDeletingProject, setIsDeletingProject] = useState(false);
    const [isTransposing, setIsTransposing] = useState(false);
    const [transposeError, setTransposeError] = useState("");
    const [isUndoing, setIsUndoing] = useState(false);
    const [undoError, setUndoError] = useState("");
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
            setTransposeError("");
            setUndoError("");
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
                setTransposeError("");
                setUndoError("");
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

    function openImportModal() {
        setError("");
        setIsImportModalOpen(true);
    }

    function openProject(project) {
        window.history.pushState(null, "", projectPath(project));
        setProjectLoadError(null);
        setTransposeError("");
        setUndoError("");
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
        setTransposeError("");
        setUndoError("");
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

    async function handleTranspose(targetKey) {
        if (!currentProject || isTransposing || isUndoing) return;

        const projectId = currentProject.id;
        setIsTransposing(true);
        setTransposeError("");

        try {
            const result = await transposeProject(
                projectId,
                targetKey,
                currentProject.current_revision
            );
            setProjects(current => current.map(project =>
                project.id === result.project.id ? result.project : project
            ));
            if (projectIdFromLocation() === projectId) {
                setActiveProject(result.project);
                setScore(result.score);
                setAnalysis(result.analysis);
                setAnalysisError(result.analysis_error || "");
            }
        } catch (requestError) {
            if (projectIdFromLocation() === projectId) {
                setTransposeError(requestError.message);
            }
        } finally {
            setIsTransposing(false);
        }
    }

    async function handleUndo() {
        if (
            !currentProject?.can_undo ||
            isUndoing ||
            isTransposing
        ) {
            return;
        }

        const projectId = currentProject.id;
        setIsUndoing(true);
        setUndoError("");

        try {
            const result = await undoProject(
                projectId,
                currentProject.current_revision
            );
            setProjects(current => current.map(project =>
                project.id === result.project.id ? result.project : project
            ));
            if (projectIdFromLocation() === projectId) {
                setActiveProject(result.project);
                setScore(result.score);
                setAnalysis(result.analysis);
                setAnalysisError(result.analysis_error || "");
            }
        } catch (requestError) {
            if (projectIdFromLocation() === projectId) {
                setUndoError(requestError.message);
            }
        } finally {
            setIsUndoing(false);
        }
    }

    async function handleImport(fileType) {
        if (!file || isImporting) return;

        setIsImporting(true);
        setError("");

        try {
            const result = fileType === "omr"
                ? await convertScore(file)
                : await createProject(file);
            setProjects(current => [
                result.project,
                ...current.filter(project => project.id !== result.project.id),
            ]);
            setActiveProject(result.project);
            setScore(result.score);
            setAnalysis(result.analysis);
            setAnalysisError(result.analysis_error || "");
            setTransposeError("");
            setUndoError("");
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
                <WorkspaceSidebar
                    projects={projects}
                    isLoadingProjects={isLoadingProjects}
                    routeProjectId={routeProjectId}
                    onShowProjects={showProjects}
                    onOpenProject={openProject}
                    onImport={openImportModal}
                />
            )}
            <div className="main-content">
                <AppHeader
                    routeProjectId={routeProjectId}
                    currentProject={currentProject}
                    search={search}
                    onSearchChange={setSearch}
                    onShowProjects={showProjects}
                />
                <main className="workspace">
                    {!routeProjectId && (
                        <ProjectLibrary
                            visibleProjects={visibleProjects}
                            search={search}
                            isLoadingProjects={isLoadingProjects}
                            projectsError={projectsError}
                            onOpenProject={openProject}
                            onImport={openImportModal}
                        />
                    )}
                    {routeProjectId &&
                        !currentProject &&
                        projectLoadError?.id !== routeProjectId && (
                            <div className="project-loading">
                                <LoadingSpinner label="Loading project..." />
                            </div>
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
                        <ProjectDetail
                            project={currentProject}
                            score={score}
                            analysis={analysis}
                            analysisError={analysisError}
                            isDeletingProject={isDeletingProject}
                            isTransposing={isTransposing}
                            transposeError={transposeError}
                            isUndoing={isUndoing}
                            undoError={undoError}
                            deleteError={deleteError}
                            onDelete={handleDeleteProject}
                            onTranspose={handleTranspose}
                            onUndo={handleUndo}
                        />
                    )}
                </main>
            </div>
            {isImportModalOpen && (
                <ImportScoreModal
                    file={file}
                    error={error}
                    isImporting={isImporting}
                    onClose={() => setIsImportModalOpen(false)}
                    onImport={handleImport}
                    onFileSelect={selectedFile => {
                        setFile(selectedFile);
                        setError("");
                    }}
                    onRemoveFile={() => {
                        setFile(null);
                        setError("");
                    }}
                />
            )}
        </div>
    );
}
