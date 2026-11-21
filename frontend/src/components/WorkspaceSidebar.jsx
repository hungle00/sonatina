export default function WorkspaceSidebar({
    projects,
    isLoadingProjects,
    routeProjectId,
    onShowProjects,
    onOpenProject,
    onImport,
}) {
    return (
        <aside className="sidebar">
            <button className="brand" onClick={onShowProjects}>
                <span className="brand-icon">♪</span>
                <span>Sonatina</span>
            </button>
            <button className="btn-primary sidebar-import" onClick={onImport}>
                <span aria-hidden="true">+</span> Import Score
            </button>
            <nav className="sidebar-section" aria-label="Workspace">
                <div className="sidebar-label">Workspace</div>
                <button
                    className={`nav-item ${!routeProjectId ? "active" : ""}`}
                    onClick={onShowProjects}
                >
                    <span>All Scores</span>
                    <span className="nav-count">{projects.length}</span>
                </button>
                <button className="nav-item nav-placeholder" disabled>
                    <span>Recent Edits</span>
                </button>
                <div className="sidebar-label quick-open-label">Quick Open</div>
                {projects.slice(0, 5).map(project => (
                    <button
                        className={`nav-item quick-open-item ${
                            project.id === routeProjectId ? "active" : ""
                        }`}
                        key={project.id}
                        title={project.name}
                        onClick={() => onOpenProject(project)}
                    >
                        <span>{project.name}</span>
                    </button>
                ))}
                {!isLoadingProjects && projects.length === 0 && (
                    <p className="sidebar-empty">No projects yet</p>
                )}
            </nav>
            <div className="sidebar-footer">Sonatina</div>
        </aside>
    );
}
