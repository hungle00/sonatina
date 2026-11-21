import LoadingSpinner from "./LoadingSpinner";

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

export default function ProjectLibrary({
    visibleProjects,
    search,
    isLoadingProjects,
    projectsError,
    onOpenProject,
    onImport,
}) {
    return (
        <>
            <div className="section-header">
                <div>
                    <h1>Projects</h1>
                    <p className="section-description">
                        Your music scores, all in one place.
                    </p>
                </div>
                <button className="btn-primary" onClick={onImport}>
                    <span aria-hidden="true">+</span> Import Score
                </button>
            </div>
            {projectsError && <p className="error-message">{projectsError}</p>}
            {isLoadingProjects ? (
                <p className="library-message">
                    <LoadingSpinner label="Loading projects..." />
                </p>
            ) : visibleProjects.length ? (
                <div className="project-grid">
                    {visibleProjects.map(project => (
                        <button
                            className="project-card"
                            key={project.id}
                            onClick={() => onOpenProject(project)}
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
                                <h2 className="card-title">{project.name}</h2>
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
                        <button className="btn-primary" onClick={onImport}>
                            <span aria-hidden="true">+</span> Import Score
                        </button>
                    )}
                </div>
            )}
        </>
    );
}
