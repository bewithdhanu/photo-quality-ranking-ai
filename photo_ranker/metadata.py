"""
Metadata cache: pre-compute per-image face embeddings, blur, pose, emotion.
Enables fast matching without re-running insightface/DeepFace on every query.
"""

import json
import os
import numpy as np

import config as cfg
from .person_finder import PersonFinder
from .quality import QualityScorer


def get_metadata_path(photo_folder: str) -> str:
    """Path to the metadata file inside the photo folder."""
    return os.path.join(photo_folder, cfg.METADATA_FILENAME)


def load_metadata(photo_folder: str) -> dict | None:
    """Load metadata from photo_folder/.photo_ranker_metadata.json. Returns None if missing or invalid."""
    path = get_metadata_path(photo_folder)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("version") != cfg.METADATA_VERSION:
            return None
        return data
    except (json.JSONDecodeError, OSError):
        return None


def save_metadata(photo_folder: str, data: dict) -> None:
    """Write metadata to photo_folder/.photo_ranker_metadata.json."""
    path = get_metadata_path(photo_folder)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=0, separators=(",", ":"))


def _face_to_dict(face) -> dict:
    """Serialize one insightface face to a JSON-safe dict (native Python types only)."""
    emb = getattr(face, "embedding", None)
    embedding = [float(x) for x in emb] if emb is not None and len(emb) else []
    bbox_raw = getattr(face, "bbox", None)
    bbox = [float(x) for x in bbox_raw[:4]] if bbox_raw is not None and len(bbox_raw) >= 4 else []
    det_score = float(getattr(face, "det_score", 0.0))
    pose = getattr(face, "pose", None)
    pose_list = [float(x) for x in pose[: min(3, len(pose))]] if pose is not None and len(pose) >= 2 else []
    return {
        "embedding": embedding,
        "bbox": bbox,
        "det_score": det_score,
        "pose": pose_list,
    }


def _facing_camera_from_stored(face_dict: dict) -> bool:
    """Whether stored face dict is 'facing camera' (pose or det_score)."""
    pose = face_dict.get("pose") or []
    if len(pose) >= 2:
        pitch, yaw = abs(pose[0]), abs(pose[1])
        if pitch <= cfg.POSE_PITCH_MAX_DEG and yaw <= cfg.POSE_YAW_MAX_DEG:
            return True
    return float(face_dict.get("det_score", 0)) >= cfg.MIN_DET_SCORE_FOR_GOOD_FACE


def _group_quality_from_stored(faces_list: list[dict]) -> float:
    """Fraction of stored faces that are 'good' (facing camera, confident)."""
    if not faces_list or len(faces_list) < cfg.MIN_FACES_FOR_GROUP:
        return 0.0
    good = sum(
        1
        for f in faces_list
        if _facing_camera_from_stored(f) and float(f.get("det_score", 0)) >= cfg.MIN_DET_SCORE_FOR_GOOD_FACE
    )
    return good / len(faces_list)


def build_image_metadata(
    img_path: str,
    finder: PersonFinder,
    quality: QualityScorer,
) -> dict | None:
    """
    Build metadata for one image: mtime, blur, list of faces (embedding, bbox, det_score, pose, happy).
    Returns None if image unreadable or no faces.
    """
    if not os.path.isfile(img_path):
        return None
    try:
        mtime = os.path.getmtime(img_path)
    except OSError:
        return None
    from .quality import blur_score as _blur_fn
    blur = _blur_fn(img_path)
    faces = finder.get_all_faces(img_path)
    if not faces:
        return None
    face_list = []
    for face in faces:
        fd = _face_to_dict(face)
        bbox = fd.get("bbox")
        if len(bbox) >= 4:
            size = min(bbox[2] - bbox[0], bbox[3] - bbox[1])
            if size < cfg.MIN_FACE_SIZE_PX:
                continue
        happy = quality.smile_for_face(img_path, face) if bbox else 0.0
        fd["happy"] = float(happy)
        face_list.append(fd)
    if not face_list:
        return None
    return {
        "mtime": float(mtime),
        "blur": float(blur),
        "faces": face_list,
    }




def sync_metadata(
    photo_folder: str,
    finder: PersonFinder,
    quality: QualityScorer,
    image_extensions: set[str],
    progress_callback=None,
) -> dict:
    """
    Ensure metadata is up to date: process new/changed images, remove missing.
    Returns the full metadata dict (after save).
    """
    existing = load_metadata(photo_folder) or {}
    images = existing.get("images") or {}
    # List current files in folder
    try:
        names = os.listdir(photo_folder)
    except OSError:
        names = []
    photo_paths = []
    for name in names:
        if name.startswith("."):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext in image_extensions:
            photo_paths.append(os.path.join(photo_folder, name))
    total = len(photo_paths)
    processed = 0
    for path in photo_paths:
        name = os.path.basename(path)
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            continue
        entry = images.get(name)
        if entry is not None and entry.get("mtime") == mtime:
            # Already up to date
            processed += 1
            if progress_callback and total:
                progress_callback(processed, total)
            continue
        # New or changed: build metadata
        meta = build_image_metadata(path, finder, quality)
        if meta is not None:
            images[name] = meta
        elif name in images:
            del images[name]  # No longer has faces or unreadable
        processed += 1
        if progress_callback and total:
            progress_callback(processed, total)
    # Remove entries for files that no longer exist
    for name in list(images.keys()):
        if not os.path.isfile(os.path.join(photo_folder, name)):
            del images[name]
    data = {
        "version": cfg.METADATA_VERSION,
        "folder": os.path.abspath(photo_folder),
        "images": images,
    }
    save_metadata(photo_folder, data)
    return data


def find_matching_face(
    ref_embedding: np.ndarray,
    faces_list: list[dict],
    threshold: float = None,
) -> tuple[int | None, float]:
    """
    Find index of first face in faces_list that matches ref_embedding (cosine sim >= threshold).
    Returns (index or None, best_similarity).
    """
    if threshold is None:
        threshold = cfg.SIMILARITY_THRESHOLD
    ref_norm = np.linalg.norm(ref_embedding)
    if ref_norm <= 0:
        return None, 0.0
    best_idx = None
    best_sim = 0.0
    for i, fd in enumerate(faces_list):
        emb = fd.get("embedding")
        if not emb or len(emb) < 2:
            continue
        arr = np.array(emb, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm <= 0:
            continue
        sim = float(np.dot(ref_embedding, arr) / (ref_norm * norm))
        if sim >= threshold and (best_idx is None or sim > best_sim):
            best_idx = i
            best_sim = sim
    return best_idx, best_sim


def score_from_metadata(entry: dict, matched_face_index: int) -> float:
    """
    Compute quality score from stored metadata (blur, faces, matched face).
    Same formula as _final_score but using stored data only.
    """
    blur_raw = float(entry.get("blur", 0))
    blur_norm = min(1.0, blur_raw / cfg.BLUR_NORMALIZE_DIVISOR)
    faces_list = entry.get("faces") or []
    is_group = len(faces_list) >= cfg.MIN_FACES_FOR_GROUP
    if is_group:
        gq = _group_quality_from_stored(faces_list)
        return cfg.WEIGHT_GROUP_QUALITY * gq + cfg.WEIGHT_GROUP_BLUR * blur_norm
    if matched_face_index is None or matched_face_index >= len(faces_list):
        return 0.0
    fd = faces_list[matched_face_index]
    smile = float(fd.get("happy", 0)) / cfg.SMILE_DIVISOR
    facing = 1.0 if _facing_camera_from_stored(fd) else 0.0
    return (
        cfg.WEIGHT_SINGLE_SMILE * smile
        + cfg.WEIGHT_SINGLE_FACING * facing
        + cfg.WEIGHT_SINGLE_BLUR * blur_norm
    )


