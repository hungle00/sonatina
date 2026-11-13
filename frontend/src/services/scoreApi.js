export async function renderScore(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/scores/render", {
        method: "POST",
        body: formData
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.detail || "Rendering failed");
    }

    return result;
}
