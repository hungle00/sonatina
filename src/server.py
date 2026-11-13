from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from api.scores import router as scores_router

BASE_DIR = Path(__file__).parent

app = FastAPI(title="Music Toolkit")

app.include_router(scores_router, prefix="/api")

@app.get("/")
def index():
    return FileResponse(BASE_DIR / "templates" / "index.html")
