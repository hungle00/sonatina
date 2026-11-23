async function uploadScore(endpoint, file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.detail || "Request failed");
    }

    return result;
}

async function requestJson(endpoint, options) {
    const response = await fetch(endpoint, options);
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.detail || "Request failed");
    }

    return result;
}

export function renderScore(file) {
    return uploadScore("/api/scores/render", file);
}

export function analyzeScore(file) {
    return uploadScore("/api/scores/analyze", file);
}

export function listProjects() {
    return requestJson("/api/projects");
}

export function createProject(file) {
    const formData = new FormData();
    formData.append("file", file);

    return requestJson("/api/projects", {
        method: "POST",
        body: formData,
    });
}

export function convertScore(file) {
    const formData = new FormData();
    formData.append("file", file);

    return requestJson("/api/omr/convert", {
        method: "POST",
        body: formData,
    });
}

export function getProject(projectId) {
    return requestJson(`/api/projects/${encodeURIComponent(projectId)}`);
}

export function transposeProject(projectId, targetKey, expectedRevision) {
    return requestJson(
        `/api/projects/${encodeURIComponent(projectId)}/transpose`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                target_key: targetKey,
                expected_revision: expectedRevision,
            }),
        }
    );
}

export function undoProject(projectId, expectedRevision) {
    return requestJson(
        `/api/projects/${encodeURIComponent(projectId)}/undo`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                expected_revision: expectedRevision,
            }),
        }
    );
}

export function deleteProject(projectId) {
    return requestJson(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
    });
}

export function projectExportUrl(projectId) {
    return `/api/projects/${encodeURIComponent(projectId)}/export`;
}
