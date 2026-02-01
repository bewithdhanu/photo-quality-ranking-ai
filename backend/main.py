"""
FastAPI backend for photo-quality-ranking web UI.
"""

import os
import sys
from contextlib import asynccontextmanager

# Ensure project root is on path so "backend" package and photo_ranker work
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

try:
    from backend import albums
except ModuleNotFoundError:
    import albums  # when run from backend/ with uvicorn main:app

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel


class NameBody(BaseModel):
    name: str = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    albums._ensure_albums_dir()
    yield


app = FastAPI(title="Photo Quality Ranking API", lifespan=lifespan)

# CORS: allow common dev origins (Vite default 5173, preview/serve often 8080, etc.)
_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# --- Health (verify this server is running) ---

@app.get("/api/health")
def api_health():
    return {"status": "ok", "service": "photo-quality-ranking-api"}


# --- Albums ---

@app.get("/api/albums")
def api_list_albums():
    return albums.list_albums()


@app.post("/api/albums")
def api_create_album(name: str = ""):
    return albums.create_album(name=name)


@app.get("/api/albums/{album_id}")
def api_get_album(album_id: str):
    a = albums.get_album(album_id)
    if not a:
        raise HTTPException(status_code=404, detail="Album not found")
    return a


@app.get("/api/albums/{album_id}/status")
def api_album_status(album_id: str):
    return albums.get_processing_status(album_id)


@app.post("/api/albums/{album_id}/upload")
async def api_upload_files(album_id: str, files: list[UploadFile] = File(...)):
    if not albums.get_album(album_id):
        raise HTTPException(status_code=404, detail="Album not found")
    saved = []
    for f in files:
        if not f.filename:
            continue
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
            continue
        content = await f.read()
        name = albums.save_upload_file(album_id, f.filename, content)
        saved.append(name)
    return {"saved": saved}


@app.post("/api/albums/{album_id}/process")
def api_start_process(album_id: str):
    if not albums.get_album(album_id):
        raise HTTPException(status_code=404, detail="Album not found")
    albums.start_processing(album_id)
    return {"status": "processing"}


@app.get("/api/albums/{album_id}/people")
def api_get_people(album_id: str):
    if not albums.get_album(album_id):
        raise HTTPException(status_code=404, detail="Album not found")
    return albums.get_people(album_id)


@app.patch("/api/albums/{album_id}/people/{person_index}")
def api_set_person_name(album_id: str, person_index: int, body: NameBody):
    if not albums.get_album(album_id):
        raise HTTPException(status_code=404, detail="Album not found")
    albums.set_person_name(album_id, person_index, body.name)
    return {"ok": True}


@app.get("/api/albums/{album_id}/people/{person_index}/photos")
def api_get_ranked_photos(album_id: str, person_index: int, top_k: int = 200):
    if not albums.get_album(album_id):
        raise HTTPException(status_code=404, detail="Album not found")
    return albums.get_ranked_photos(album_id, person_index, top_k=top_k)


@app.get("/api/albums/{album_id}/photos/{filename}")
def api_serve_photo(album_id: str, filename: str):
    path = albums.get_photo_path(album_id, filename)
    if not path:
        raise HTTPException(status_code=404, detail="Photo not found")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/albums/{album_id}/faces/{crop_name}")
def api_serve_face_crop(album_id: str, crop_name: str):
    path = albums.get_face_crop_path(album_id, crop_name)
    if not path:
        raise HTTPException(status_code=404, detail="Face crop not found")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/albums/{album_id}/photos/{filename}/faces")
def api_get_faces_in_photo(album_id: str, filename: str):
    if not albums.get_album(album_id):
        raise HTTPException(status_code=404, detail="Album not found")
    return albums.get_faces_in_photo(album_id, filename)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
