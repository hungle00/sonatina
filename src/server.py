from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.projects import router as projects_router
from api.scores import router as scores_router

BASE_DIR = Path(__file__).parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

app = FastAPI(title="Music Toolkit")

app.include_router(scores_router, prefix="/api")
app.include_router(projects_router, prefix="/api")

if (FRONTEND_DIST / "assets").is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="frontend-assets",
    )

@app.get("/")
def index():
    frontend_index = FRONTEND_DIST / "index.html"
    if frontend_index.is_file():
        return FileResponse(frontend_index)
    return FileResponse(BASE_DIR / "templates" / "index.html")


@app.get("/{frontend_path:path}", include_in_schema=False)
def frontend_route(frontend_path: str):
    if frontend_path == "api" or frontend_path.startswith("api/"):
        raise HTTPException(404, "Not found")

    frontend_index = FRONTEND_DIST / "index.html"
    if not frontend_index.is_file():
        raise HTTPException(404, "Not found")

    static_file = (FRONTEND_DIST / frontend_path).resolve()
    if static_file.is_relative_to(FRONTEND_DIST.resolve()) and static_file.is_file():
        return FileResponse(static_file)
    return FileResponse(frontend_index)
