"""
Discover unique faces in an album from metadata (cluster by embedding similarity).
Used for --list-faces and --select N workflows.
"""

import os
from typing import List

import numpy as np
import cv2

import config as cfg


def get_all_faces_from_metadata(metadata: dict, photo_folder: str) -> List[dict]:
    """
    Flatten metadata into a list of faces, each with path, name, face_index, embedding (numpy), bbox, det_score.
    """
    images = metadata.get("images") or {}
    out = []
    for name, entry in images.items():
        path = os.path.join(photo_folder, name)
        if not os.path.isfile(path):
            continue
        faces_list = entry.get("faces") or []
        for fi, fd in enumerate(faces_list):
            emb = fd.get("embedding")
            if not emb or len(emb) < 2:
                continue
            out.append({
                "path": path,
                "name": name,
                "face_index": fi,
                "embedding": np.array(emb, dtype=np.float32),
                "bbox": fd.get("bbox") or [],
                "det_score": float(fd.get("det_score", 0)),
            })
    return out


def cluster_faces(
    face_list: List[dict],
    threshold: float = None,
) -> List[List[int]]:
    """
    Group faces by identity (cosine similarity >= threshold).
    Returns list of clusters; each cluster is a list of indices into face_list.
    Order: clusters sorted by size descending (largest first).
    """
    if threshold is None:
        threshold = cfg.SIMILARITY_THRESHOLD
    n = len(face_list)
    if n == 0:
        return []
    # Assign each face to a cluster: for each face, find best-matching existing cluster rep; else new cluster
    clusters = []  # list of list of indices
    rep_indices = []  # representative index per cluster (best det_score in cluster)

    for i in range(n):
        emb = face_list[i]["embedding"]
        norm_i = np.linalg.norm(emb)
        if norm_i <= 0:
            continue
        best_c = -1
        best_sim = threshold
        for c, cluster in enumerate(clusters):
            rep_i = rep_indices[c]
            rep_emb = face_list[rep_i]["embedding"]
            norm_rep = np.linalg.norm(rep_emb)
            if norm_rep <= 0:
                continue
            sim = float(np.dot(emb, rep_emb) / (norm_i * norm_rep))
            if sim >= threshold and sim > best_sim:
                best_sim = sim
                best_c = c
        if best_c >= 0:
            clusters[best_c].append(i)
            # Update rep to highest det_score in cluster
            rep_indices[best_c] = max(
                clusters[best_c],
                key=lambda idx: face_list[idx]["det_score"],
            )
        else:
            clusters.append([i])
            rep_indices.append(i)

    # Sort clusters by size descending
    clusters.sort(key=len, reverse=True)
    return clusters


def get_unique_faces(
    metadata: dict,
    photo_folder: str,
    threshold: float = None,
) -> List[dict]:
    """
    Return one representative per unique person (cluster).
    Each item: embedding (numpy), path, name, face_index, count, det_score.
    Order: by cluster size descending (person 0 = most photos).
    """
    face_list = get_all_faces_from_metadata(metadata, photo_folder)
    if not face_list:
        return []
    clusters = cluster_faces(face_list, threshold)
    out = []
    for cluster in clusters:
        if not cluster:
            continue
        # Representative = face with best det_score in cluster
        rep_idx = max(cluster, key=lambda i: face_list[i]["det_score"])
        rec = face_list[rep_idx]
        out.append({
            "embedding": rec["embedding"].copy(),
            "path": rec["path"],
            "name": rec["name"],
            "face_index": rec["face_index"],
            "count": len(cluster),
            "det_score": rec["det_score"],
            "bbox": rec.get("bbox", []),
        })
    return out


def save_face_crops(
    unique_faces: List[dict],
    output_dir: str,
    size: int = 256,
) -> List[str]:
    """
    Save representative face crop for each unique person to output_dir/person_0.jpg, person_1.jpg, ...
    Returns list of saved file paths.
    """
    os.makedirs(output_dir, exist_ok=True)
    saved = []
    for i, uf in enumerate(unique_faces):
        path = uf["path"]
        bbox = uf.get("bbox") or []
        if len(bbox) < 4:
            continue
        img = cv2.imread(path)
        if img is None:
            continue
        h, w = img.shape[:2]
        x1, y1, x2, y2 = [int(round(x)) for x in bbox[:4]]
        x1, x2 = max(0, x1), min(w, x2)
        y1, y2 = max(0, y1), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        crop = img[y1:y2, x1:x2]
        if size and (crop.shape[0] != size or crop.shape[1] != size):
            crop = cv2.resize(crop, (size, size), interpolation=cv2.INTER_LINEAR)
        out_path = os.path.join(output_dir, f"person_{i}.jpg")
        cv2.imwrite(out_path, crop)
        saved.append(out_path)
    return saved


def get_faces_in_image(
    metadata: dict,
    unique_faces: List[dict],
    filename: str,
    threshold: float = None,
) -> List[dict]:
    """
    For one image (filename), return each face with its person_index (which unique person it matches).
    Returns list of { face_index, person_index, bbox }.
    """
    if threshold is None:
        threshold = cfg.SIMILARITY_THRESHOLD
    images = metadata.get("images") or {}
    entry = images.get(filename)
    if not entry:
        return []
    faces_list = entry.get("faces") or []
    out = []
    for fi, fd in enumerate(faces_list):
        emb = fd.get("embedding")
        if not emb or len(emb) < 2:
            continue
        arr = np.array(emb, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm <= 0:
            continue
        best_person = -1
        best_sim = threshold
        for pi, uf in enumerate(unique_faces):
            ref_emb = uf.get("embedding")
            if ref_emb is None or len(ref_emb) == 0:
                continue
            ref_norm = np.linalg.norm(ref_emb)
            if ref_norm <= 0:
                continue
            sim = float(np.dot(arr, ref_emb) / (norm * ref_norm))
            if sim >= threshold and sim > best_sim:
                best_sim = sim
                best_person = pi
        bbox = fd.get("bbox") or []
        out.append({
            "face_index": fi,
            "person_index": best_person if best_person >= 0 else None,
            "bbox": bbox,
        })
    return out
