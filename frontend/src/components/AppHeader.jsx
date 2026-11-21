export default function AppHeader({
    routeProjectId,
    currentProject,
    search,
    onSearchChange,
    onShowProjects,
}) {
    return (
        <header className="app-header">
            <div className="breadcrumb">
                {routeProjectId ? (
                    <button className="back-to-dashboard" onClick={onShowProjects}>
                        <span aria-hidden="true">←</span>
                        Dashboard
                    </button>
                ) : (
                    <button onClick={onShowProjects}>Music Toolkit</button>
                )}
                {!routeProjectId && <span aria-hidden="true">/</span>}
                {currentProject ? (
                    <strong title={currentProject.name}>{currentProject.name}</strong>
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
                    onChange={event => onSearchChange(event.target.value)}
                    placeholder="Search scores..."
                    aria-label="Search scores"
                />
            </label>
        </header>
    );
}
