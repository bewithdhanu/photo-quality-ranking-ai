"""
Album storage and processing: create album, upload files, run sync, list people, names, ranked photos.
"""

import json
import os
import shutil
import threading
import uuid
from typing import Any

# Add project root to path
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in __import__("sys").path:
    __import__("sys").path.insert(0, _ROOT)

import config as cfg
from photo_ranker import metadata as meta
from photo_ranker import unique_faces as uf
from photo_ranker.person_finder import PersonFinder
from photo_ranker.quality import QualityScorer
from photo_ranker.ranker import rank_photos_from_metadata

ALBUMS_DIR = os.path.join(_ROOT, "user-data", "albums")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
ALBUM_META_FILE = ".album.json"


def _ensure_albums_dir() -> str:
    os.makedirs(ALBUMS_DIR, exist_ok=True)
    return ALBUMS_DIR


def _album_path(album_id: str) -> str:
    return os.path.join(_ensure_albums_dir(), album_id)


def _album_meta_path(album_id: str) -> str:
    return os.path.join(_album_path(album_id), ALBUM_META_FILE)


def _load_album_meta(album_id: str) -> dict:
    path = _album_meta_path(album_id)
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save_album_meta(album_id: str, data: dict) -> None:
    path = _album_meta_path(album_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def create_album(name: str = "") -> dict:
    """Create a new album directory and return { id, name, status }."""
    _ensure_albums_dir()
    album_id = str(uuid.uuid4())
    path = _album_path(album_id)
    os.makedirs(path, exist_ok=True)
    meta_data = {"name": name or "Untitled Album", "status": "pending", "person_names": {}}
    _save_album_meta(album_id, meta_data)
    return {"id": album_id, "name": meta_data["name"], "status": meta_data["status"]}


def get_album(album_id: str) -> dict | None:
    """Return album info or None if not found."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        return None
    m = _load_album_meta(album_id)
    return {
        "id": album_id,
        "name": m.get("name", "Untitled Album"),
        "status": m.get("status", "pending"),
        "person_names": m.get("person_names", {}),
    }


def list_albums() -> list[dict]:
    """List all albums (id, name, status)."""
    _ensure_albums_dir()
    out = []
    for name in os.listdir(ALBUMS_DIR):
        path = os.path.join(ALBUMS_DIR, name)
        if not os.path.isdir(path) or name.startswith("."):
            continue
        m = _load_album_meta(name)
        out.append({
            "id": name,
            "name": m.get("name", "Untitled Album"),
            "status": m.get("status", "pending"),
        })
    return out


def save_upload_file(album_id: str, filename: str, content: bytes) -> str:
    """Save an uploaded file into the album. Returns the stored filename (safe)."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        raise FileNotFoundError(f"Album {album_id} not found")
    # Keep original name; if duplicate, allow overwrite or use unique name
    safe = os.path.basename(filename).strip() or "image.jpg"
    dest = os.path.join(path, safe)
    with open(dest, "wb") as f:
        f.write(content)
    return safe


def start_processing(album_id: str) -> None:
    """Set status to processing and run sync in a background thread."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        raise FileNotFoundError(f"Album {album_id} not found")

    m = _load_album_meta(album_id)
    if m.get("status") == "processing":
        return
    m["status"] = "processing"
    _save_album_meta(album_id, m)

    def run():
        try:
            finder = PersonFinder()
            quality = QualityScorer()
            sync_meta = meta.sync_metadata(
                path,
                finder,
                quality,
                IMAGE_EXTENSIONS,
                progress_callback=None,
            )
            unique = uf.get_unique_faces(sync_meta, path)
            crop_dir = os.path.join(path, cfg.FACE_CROP_DIR)
            uf.save_face_crops(unique, crop_dir, size=cfg.FACE_CROP_SIZE)
            m2 = _load_album_meta(album_id)
            m2["status"] = "done"
            _save_album_meta(album_id, m2)
        except Exception as e:
            m2 = _load_album_meta(album_id)
            m2["status"] = "error"
            m2["error"] = str(e)
            _save_album_meta(album_id, m2)

    threading.Thread(target=run, daemon=True).start()


def get_processing_status(album_id: str) -> dict:
    """Return { status, error? }."""
    info = get_album(album_id)
    if not info:
        return {"status": "not_found"}
    m = _load_album_meta(album_id)
    out = {"status": m.get("status", "pending")}
    if m.get("error"):
        out["error"] = m["error"]
    return out


def get_people(album_id: str) -> list[dict]:
    """List unique people (after processing). Each: { index, crop_url_path, name?, count }."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        return []
    m = _load_album_meta(album_id)
    if m.get("status") != "done":
        return []
    metadata = meta.load_metadata(path)
    if not metadata:
        return []
    unique = uf.get_unique_faces(metadata, path)
    person_names = m.get("person_names") or {}
    out = []
    for i, u in enumerate(unique):
        out.append({
            "index": i,
            "crop_url_path": f"/api/albums/{album_id}/faces/person_{i}.jpg",
            "name": person_names.get(str(i)),
            "count": u.get("count", 0),
        })
    return out


def set_person_name(album_id: str, person_index: int, name: str) -> None:
    """Set display name for a unique person."""
    m = _load_album_meta(album_id)
    if "person_names" not in m:
        m["person_names"] = {}
    m["person_names"][str(person_index)] = (name or "").strip() or None
    if m["person_names"][str(person_index)] is None:
        del m["person_names"][str(person_index)]
    _save_album_meta(album_id, m)


def get_ranked_photos(album_id: str, person_index: int, top_k: int = 200) -> list[dict]:
    """Return ranked photos for the person: [{ path, score, url_path }]."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        return []
    m = _load_album_meta(album_id)
    if m.get("status") != "done":
        return []
    metadata = meta.load_metadata(path)
    if not metadata:
        return []
    unique = uf.get_unique_faces(metadata, path)
    if person_index < 0 or person_index >= len(unique):
        return []
    finder = PersonFinder()
    ref_emb = unique[person_index]["embedding"]
    ranked = rank_photos_from_metadata(
        path,
        metadata,
        finder,
        ref_img_path=None,
        ref_embedding=ref_emb,
        top_k=top_k,
        progress_callback=None,
        verbose=False,
    )
    out = []
    for photo_path, score in ranked:
        name = os.path.basename(photo_path)
        out.append({
            "path": name,
            "score": round(score, 4),
            "url_path": f"/api/albums/{album_id}/photos/{name}",
        })
    return out


def get_faces_in_photo(album_id: str, filename: str) -> list[dict]:
    """Return faces in one photo: [{ face_index, person_index, bbox, name? }]."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        return []
    m = _load_album_meta(album_id)
    if m.get("status") != "done":
        return []
    metadata = meta.load_metadata(path)
    if not metadata:
        return []
    unique = uf.get_unique_faces(metadata, path)
    person_names = m.get("person_names") or {}
    faces = uf.get_faces_in_image(metadata, unique, filename)
    out = []
    for f in faces:
        pi = f.get("person_index")
        out.append({
            "face_index": f["face_index"],
            "person_index": pi,
            "bbox": f.get("bbox", []),
            "name": person_names.get(str(pi)) if pi is not None else None,
        })
    return out


def get_photo_path(album_id: str, filename: str) -> str | None:
    """Return absolute path to photo file or None."""
    path = _album_path(album_id)
    full = os.path.join(path, os.path.basename(filename))
    if os.path.isfile(full):
        return full
    return None


def get_face_crop_path(album_id: str, crop_name: str) -> str | None:
    """Return absolute path to face crop (e.g. person_0.jpg) or None."""
    path = os.path.join(_album_path(album_id), cfg.FACE_CROP_DIR, os.path.basename(crop_name))
    if os.path.isfile(path):
        return path
    return None
