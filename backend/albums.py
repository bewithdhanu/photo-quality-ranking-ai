"""
Album storage and processing: create album, upload files, run sync, list people (global names), ranked photos.
"""

import json
import os
import shutil
import threading
import uuid
from typing import Any

import numpy as np

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

try:
    from backend import global_people as gp
except ModuleNotFoundError:
    import global_people as gp

ALBUMS_DIR = os.path.join(_ROOT, "user-data", "albums")
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
ALBUM_META_FILE = ".album.json"
FACE_CROP_PREFIX = "person_"


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
    meta_data = {
        "name": name or "Untitled Album",
        "status": "pending",
        "person_names": {},
        "person_global_ids": {},
        "deleted_person_indices": [],
    }
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
        "person_global_ids": m.get("person_global_ids", {}),
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
            m2 = _load_album_meta(album_id)
            # Match clusters to global people so names carry across albums
            person_global_ids = m2.get("person_global_ids") or {}
            for i, u in enumerate(unique):
                if str(i) in person_global_ids:
                    continue
                emb = u.get("embedding")
                if emb is not None:
                    global_id = gp.find_best_match(emb)
                    if global_id:
                        person_global_ids[str(i)] = global_id
            m2["person_global_ids"] = person_global_ids
            m2["deleted_person_indices"] = m2.get("deleted_person_indices") or []
            crop_dir = os.path.join(path, cfg.FACE_CROP_DIR)
            uf.save_face_crops(unique, crop_dir, size=cfg.FACE_CROP_SIZE)
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
    """List unique people (after processing). Each: { index, crop_url_path, name?, count, global_id? }. Excludes deleted."""
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
    person_global_ids = m.get("person_global_ids") or {}
    person_names = m.get("person_names") or {}  # legacy fallback
    deleted = set(m.get("deleted_person_indices") or [])
    out = []
    for i, u in enumerate(unique):
        if i in deleted:
            continue
        global_id = person_global_ids.get(str(i))
        name = None
        if global_id:
            p = gp.get_person(global_id)
            if p:
                name = p.get("name")
        if name is None:
            name = person_names.get(str(i))
        crop_path = f"/api/albums/{album_id}/faces/person_{i}.jpg"
        out.append({
            "index": i,
            "crop_url_path": crop_path,
            "name": name,
            "count": u.get("count", 0),
            "global_id": global_id,
        })
    return out


def set_person_name(album_id: str, person_index: int, name: str) -> None:
    """Set display name for a unique person (global). Creates or updates global person and links album cluster."""
    name = (name or "").strip() or "Unnamed"
    path = _album_path(album_id)
    m = _load_album_meta(album_id)
    if m.get("status") != "done":
        raise ValueError("Album not processed yet")
    metadata = meta.load_metadata(path)
    if not metadata:
        raise ValueError("No metadata")
    unique = uf.get_unique_faces(metadata, path)
    if person_index < 0 or person_index >= len(unique):
        raise ValueError("Invalid person index")
    person_global_ids = m.get("person_global_ids") or {}
    global_id = person_global_ids.get(str(person_index))
    emb = unique[person_index].get("embedding")
    if global_id:
        gp.update_person_name(global_id, name)
    else:
        if emb is None:
            raise ValueError("No embedding for this person")
        global_id = gp.add_person(name, emb)
        person_global_ids[str(person_index)] = global_id
        m["person_global_ids"] = person_global_ids
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
    """Return faces in one photo: [{ face_index, person_index, bbox, name? }]. Names from global people."""
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
    person_global_ids = m.get("person_global_ids") or {}
    person_names = m.get("person_names") or {}  # legacy fallback
    faces = uf.get_faces_in_image(metadata, unique, filename)
    out = []
    for f in faces:
        pi = f.get("person_index")
        name = None
        if pi is not None:
            gid = person_global_ids.get(str(pi))
            if gid:
                p = gp.get_person(gid)
                if p:
                    name = p.get("name")
            if name is None:
                name = person_names.get(str(pi))
        out.append({
            "face_index": f["face_index"],
            "person_index": pi,
            "bbox": f.get("bbox", []),
            "name": name,
        })
    return out


def rename_album(album_id: str, name: str) -> None:
    """Update album display name."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        raise FileNotFoundError(f"Album {album_id} not found")
    m = _load_album_meta(album_id)
    m["name"] = (name or "").strip() or "Untitled Album"
    _save_album_meta(album_id, m)


def delete_album(album_id: str) -> None:
    """Remove album directory and all contents."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        raise FileNotFoundError(f"Album {album_id} not found")
    shutil.rmtree(path)


def list_album_photos(album_id: str) -> list[dict]:
    """List photo files in album. Returns [{ filename, url_path }] (excludes metadata/crops)."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        return []
    out = []
    for name in os.listdir(path):
        if name.startswith(".") or name == ALBUM_META_FILE:
            continue
        full = os.path.join(path, name)
        if not os.path.isfile(full):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext not in IMAGE_EXTENSIONS:
            continue
        out.append({
            "filename": name,
            "url_path": f"/api/albums/{album_id}/photos/{name}",
        })
    return sorted(out, key=lambda x: x["filename"])


def delete_photo(album_id: str, filename: str) -> None:
    """Remove a photo file from the album and remove it from metadata cache."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        raise FileNotFoundError(f"Album {album_id} not found")
    safe = os.path.basename(filename).strip()
    full = os.path.join(path, safe)
    if not os.path.isfile(full):
        raise FileNotFoundError(f"Photo {safe} not found")
    os.remove(full)
    # Remove from metadata so unique faces / counts stay correct on next process
    metadata = meta.load_metadata(path)
    if metadata and metadata.get("images"):
        metadata["images"].pop(safe, None)
        meta.save_metadata(path, metadata)


def delete_person_from_album(album_id: str, person_index: int) -> None:
    """Remove a person from the album: hide from list, remove face crop, unlink global id."""
    path = _album_path(album_id)
    if not os.path.isdir(path):
        raise FileNotFoundError(f"Album {album_id} not found")
    m = _load_album_meta(album_id)
    if m.get("status") != "done":
        raise ValueError("Album not processed yet")
    person_global_ids = m.get("person_global_ids") or {}
    deleted = set(m.get("deleted_person_indices") or [])
    deleted.add(person_index)
    m["deleted_person_indices"] = sorted(deleted)
    person_global_ids.pop(str(person_index), None)
    m["person_global_ids"] = person_global_ids
    _save_album_meta(album_id, m)
    crop_dir = os.path.join(path, cfg.FACE_CROP_DIR)
    crop_path = os.path.join(crop_dir, f"{FACE_CROP_PREFIX}{person_index}.jpg")
    if os.path.isfile(crop_path):
        os.remove(crop_path)


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


def _embedding_to_arr(emb) -> np.ndarray:
    """Convert embedding to float32 numpy array."""
    if hasattr(emb, "tolist"):
        return np.array(emb.tolist(), dtype=np.float32)
    if isinstance(emb, (list, tuple)):
        return np.array([float(x) for x in emb], dtype=np.float32)
    return np.array(emb, dtype=np.float32)


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na <= 0 or nb <= 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def _get_all_search_candidates() -> list[dict]:
    """
    Build search index: global people + every unique face from every processed album.
    Each candidate: { id, name, embedding (np) }. id is global_id or "album:{album_id}:{person_index}".
    """
    candidates = []
    # Global people
    for p in gp.list_global_people():
        pid = p.get("id")
        name = p.get("name") or "Unnamed"
        full = gp.get_person(pid)
        if not full or not full.get("embedding"):
            continue
        emb = _embedding_to_arr(full["embedding"])
        if len(emb) < 2:
            continue
        candidates.append({"id": pid, "name": name, "embedding": emb})
    # Album unique faces (so same-photo-from-album matches even if person was never named)
    _ensure_albums_dir()
    for album_id in os.listdir(ALBUMS_DIR):
        path = os.path.join(ALBUMS_DIR, album_id)
        if not os.path.isdir(path) or album_id.startswith("."):
            continue
        m = _load_album_meta(album_id)
        if m.get("status") != "done":
            continue
        metadata = meta.load_metadata(path)
        if not metadata:
            continue
        unique = uf.get_unique_faces(metadata, path)
        person_global_ids = m.get("person_global_ids") or {}
        person_names = m.get("person_names") or {}
        deleted = set(m.get("deleted_person_indices") or [])
        for i, u in enumerate(unique):
            if i in deleted:
                continue
            emb = u.get("embedding")
            if emb is None or (hasattr(emb, "size") and emb.size < 2) or (isinstance(emb, (list, tuple)) and len(emb) < 2):
                continue
            emb_arr = _embedding_to_arr(emb)
            global_id = person_global_ids.get(str(i))
            name = person_names.get(str(i))
            if global_id:
                p = gp.get_person(global_id)
                if p:
                    name = p.get("name") or "Unnamed"
            if not name:
                name = f"Person {i}"
            # Use global_id when linked so result is one person; use album:... when not yet named
            cand_id = global_id if global_id else f"album:{album_id}:{i}"
            candidates.append({"id": cand_id, "name": name, "embedding": emb_arr})
    return candidates


def _find_best_match_combined(embedding, threshold: float) -> tuple[str | None, float]:
    """Best match from combined candidates (global + album faces). Returns (id, similarity)."""
    emb_arr = _embedding_to_arr(embedding)
    if len(emb_arr) < 2:
        return (None, 0.0)
    candidates = _get_all_search_candidates()
    best_id = None
    best_sim = -1.0
    for c in candidates:
        sim = _cosine_sim(emb_arr, c["embedding"])
        if sim > best_sim:
            best_sim = sim
            best_id = c["id"]
    if best_sim >= threshold:
        return (best_id, float(best_sim))
    return (None, float(best_sim))


def _get_top_matches_combined(embedding, top_k: int) -> list[dict]:
    """Top-k matches from combined candidates (dedupe by id, keep best sim). Each { id, name, similarity }."""
    emb_arr = _embedding_to_arr(embedding)
    if len(emb_arr) < 2:
        return []
    candidates = _get_all_search_candidates()
    by_id = {}
    for c in candidates:
        sim = _cosine_sim(emb_arr, c["embedding"])
        cid = c["id"]
        if cid not in by_id or sim > by_id[cid]["similarity"]:
            by_id[cid] = {"id": cid, "name": c["name"], "similarity": float(sim)}
    scored = list(by_id.values())
    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]


def get_albums_and_photos_for_global_person(global_id: str) -> tuple[list[dict], list[dict]]:
    """Return (albums, photos) where this global person appears. Albums: [{ id, name }]. Photos: [{ album_id, album_name, filename, url_path, score }]."""
    albums_out = []
    photos_out = []
    _ensure_albums_dir()
    for album_id in os.listdir(ALBUMS_DIR):
        path = os.path.join(ALBUMS_DIR, album_id)
        if not os.path.isdir(path) or album_id.startswith("."):
            continue
        m = _load_album_meta(album_id)
        if m.get("status") != "done":
            continue
        person_global_ids = m.get("person_global_ids") or {}
        deleted = set(m.get("deleted_person_indices") or [])
        person_index = None
        for idx_str, gid in person_global_ids.items():
            if gid == global_id:
                idx = int(idx_str)
                if idx not in deleted:
                    person_index = idx
                    break
        if person_index is None:
            continue
        album_name = m.get("name", "Untitled Album")
        albums_out.append({"id": album_id, "name": album_name})
        ranked = get_ranked_photos(album_id, person_index, top_k=500)
        for r in ranked:
            photos_out.append({
                "album_id": album_id,
                "album_name": album_name,
                "filename": r["path"],
                "url_path": r["url_path"],
                "score": r.get("score"),
            })
    return (albums_out, photos_out)


def get_albums_and_photos_for_album_person(album_id: str, person_index: int) -> tuple[list[dict], list[dict]]:
    """Return (albums, photos) for one album's one person (when not in global_people)."""
    if not get_album(album_id):
        return ([], [])
    m = _load_album_meta(album_id)
    if m.get("status") != "done":
        return ([], [])
    deleted = set(m.get("deleted_person_indices") or [])
    if person_index in deleted:
        return ([], [])
    album_name = m.get("name", "Untitled Album")
    albums_list = [{"id": album_id, "name": album_name}]
    ranked = get_ranked_photos(album_id, person_index, top_k=500)
    photos_list = [
        {"album_id": album_id, "album_name": album_name, "filename": r["path"], "url_path": r["url_path"], "score": r.get("score")}
        for r in ranked
    ]
    return (albums_list, photos_list)


def get_person_albums_photos(person_id: str) -> dict | None:
    """
    Return { person: { id, name }, albums, photos }.
    person_id can be a global_id or "album:{album_id}:{person_index}" (album-only person).
    """
    if person_id.startswith("album:"):
        parts = person_id.split(":", 2)
        if len(parts) != 3:
            return None
        _, album_id, idx_str = parts
        try:
            person_index = int(idx_str)
        except ValueError:
            return None
        if not get_album(album_id):
            return None
        m = _load_album_meta(album_id)
        if m.get("status") != "done":
            return None
        deleted = set(m.get("deleted_person_indices") or [])
        if person_index in deleted:
            return None
        person_names = m.get("person_names") or {}
        name = person_names.get(str(person_index)) or f"Person {person_index}"
        albums_list, photos_list = get_albums_and_photos_for_album_person(album_id, person_index)
        return {
            "person": {"id": person_id, "name": name},
            "albums": albums_list,
            "photos": photos_list,
        }
    person = gp.get_person(person_id)
    if not person:
        return None
    albums_list, photos_list = get_albums_and_photos_for_global_person(person_id)
    return {
        "person": {"id": person["id"], "name": person.get("name") or "Unnamed"},
        "albums": albums_list,
        "photos": photos_list,
    }


def _suffix_for_image_bytes(image_bytes: bytes) -> str:
    """Return file suffix so cv2.imread decodes correctly (JPEG/PNG/WebP/BMP)."""
    if not image_bytes or len(image_bytes) < 12:
        return ".jpg"
    if image_bytes[:2] == b"\xff\xd8":
        return ".jpg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return ".webp"
    if image_bytes[:2] == b"BM":
        return ".bmp"
    return ".jpg"


def find_person_by_photo(image_bytes: bytes) -> dict:
    """
    Match an uploaded photo against global people AND all album face embeddings.
    So same-photo-from-album matches even if the person was never named (global_people).
    Always returns top 3 candidates. Returns { matched, person?, albums?, photos?, best_similarity?, candidates }.
    """
    import tempfile
    temp_path = None
    try:
        suffix = _suffix_for_image_bytes(image_bytes)
        fd, temp_path = tempfile.mkstemp(suffix=suffix)
        try:
            os.write(fd, image_bytes)
        finally:
            os.close(fd)
        finder = PersonFinder()
        emb = finder.get_embedding(temp_path)
        if emb is None:
            return {"matched": False, "candidates": []}
        # Search combined index: global people + every album unique face
        threshold = getattr(cfg, "FIND_PERSON_SIMILARITY_THRESHOLD", cfg.SIMILARITY_THRESHOLD)
        best_id, best_sim = _find_best_match_combined(emb, threshold)
        candidates = _get_top_matches_combined(emb, top_k=3)
        candidates_rounded = [
            {"id": c["id"], "name": c["name"], "similarity": round(c["similarity"], 4)}
            for c in candidates
        ]
        if best_id is None:
            return {
                "matched": False,
                "best_similarity": round(best_sim, 4),
                "candidates": candidates_rounded,
            }
        result = get_person_albums_photos(best_id)
        if not result:
            return {
                "matched": False,
                "best_similarity": round(best_sim, 4),
                "candidates": candidates_rounded,
            }
        return {
            "matched": True,
            "person": result["person"],
            "albums": result["albums"],
            "photos": result["photos"],
            "best_similarity": round(best_sim, 4),
            "candidates": candidates_rounded,
        }
    except Exception as e:
        return {"matched": False, "error": str(e), "candidates": []}
    finally:
        if temp_path and os.path.isfile(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
