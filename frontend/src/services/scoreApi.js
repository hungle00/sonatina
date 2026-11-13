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

export function renderScore(file) {
    return uploadScore("/api/scores/render", file);
}

export function analyzeScore(file) {
    return uploadScore("/api/scores/analyze", file);
}
