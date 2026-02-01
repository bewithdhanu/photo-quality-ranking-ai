"""
Global person registry: names and embeddings so the same person can be recognized across albums.
"""

import json
import os
import uuid

import numpy as np

# Project root
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in __import__("sys").path:
    __import__("sys").path.insert(0, _ROOT)

import config as cfg

GLOBAL_PEOPLE_DIR = os.path.join(_ROOT, "user-data")
GLOBAL_PEOPLE_FILE = "global_people.json"


def _global_people_path() -> str:
    os.makedirs(GLOBAL_PEOPLE_DIR, exist_ok=True)
    return os.path.join(GLOBAL_PEOPLE_DIR, GLOBAL_PEOPLE_FILE)


def _load() -> dict:
    path = _global_people_path()
    if not os.path.isfile(path):
        return {"people": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) and "people" in data else {"people": []}
    except (json.JSONDecodeError, OSError):
        return {"people": []}


def _save(data: dict) -> None:
    path = _global_people_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _embedding_to_list(emb) -> list:
    if hasattr(emb, "tolist"):
        return [float(x) for x in emb.tolist()]
    if isinstance(emb, (list, tuple)):
        return [float(x) for x in emb]
    return []


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na <= 0 or nb <= 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def list_global_people() -> list[dict]:
    """Return all global people: [{ id, name }, ...]."""
    data = _load()
    return [{"id": p["id"], "name": p.get("name") or ""} for p in data.get("people", [])]


def get_person(global_id: str) -> dict | None:
    """Get one person by id. Returns { id, name, embedding } or None."""
    data = _load()
    for p in data.get("people", []):
        if p.get("id") == global_id:
            return p
    return None


def add_person(name: str, embedding) -> str:
    """Add a new global person. Returns new id."""
    emb_list = _embedding_to_list(embedding)
    if not emb_list:
        raise ValueError("embedding required")
    data = _load()
    person_id = str(uuid.uuid4())
    data["people"].append({
        "id": person_id,
        "name": (name or "").strip() or "Unnamed",
        "embedding": emb_list,
    })
    _save(data)
    return person_id


def update_person_name(global_id: str, name: str) -> None:
    """Update a global person's name."""
    data = _load()
    for p in data["people"]:
        if p.get("id") == global_id:
            p["name"] = (name or "").strip() or "Unnamed"
            _save(data)
            return
    raise KeyError(f"Person {global_id} not found")


def find_best_match(embedding, threshold: float = None) -> str | None:
    """Find global person id with highest cosine similarity >= threshold. Returns id or None."""
    _id, _ = find_best_match_with_score(embedding, threshold)
    return _id


def find_best_match_with_score(embedding, threshold: float = None) -> tuple[str | None, float]:
    """Find best matching global person. Returns (id or None, best_similarity)."""
    if threshold is None:
        threshold = cfg.SIMILARITY_THRESHOLD
    emb_arr = np.array(_embedding_to_list(embedding), dtype=np.float32)
    if len(emb_arr) < 2:
        return (None, 0.0)
    data = _load()
    best_id = None
    best_sim = -1.0
    for p in data.get("people", []):
        emb_list = p.get("embedding")
        if not emb_list or len(emb_list) < 2:
            continue
        ref = np.array(emb_list, dtype=np.float32)
        sim = _cosine_similarity(emb_arr, ref)
        if sim > best_sim:
            best_sim = sim
            best_id = p["id"]
    if best_sim >= threshold:
        return (best_id, float(best_sim))
    return (None, float(best_sim))


def get_top_matches(embedding, top_k: int = 3) -> list[dict]:
    """Return top_k global people by cosine similarity, each { id, name, similarity }. Sorted desc by similarity."""
    emb_arr = np.array(_embedding_to_list(embedding), dtype=np.float32)
    if len(emb_arr) < 2:
        return []
    data = _load()
    scored = []
    for p in data.get("people", []):
        emb_list = p.get("embedding")
        if not emb_list or len(emb_list) < 2:
            continue
        ref = np.array(emb_list, dtype=np.float32)
        sim = _cosine_similarity(emb_arr, ref)
        scored.append({
            "id": p["id"],
            "name": p.get("name") or "Unnamed",
            "similarity": float(sim),
        })
    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]
