"""
Orchestration: combine person finder + quality signals into final score and ranking.
"""

import os
import sys
from typing import List, Tuple

import config as cfg
from .person_finder import PersonFinder
from .quality import QualityScorer


def _final_score(
    img_path: str,
    finder: PersonFinder,
    quality: QualityScorer,
) -> float:
    """
    Score for one image: 0 only if person not in photo;
    else weighted combination of quality signals (blur penalizes but does not exclude).
    """
    exists, matched_face = finder.person_exists(img_path)
    if not exists:
        return 0.0

    # Use blur as score penalty, not hard reject (so all matches appear in results)
    blur_norm = quality.blur_normalized(img_path)
    faces = finder.get_all_faces(img_path)
    is_group = len(faces) >= cfg.MIN_FACES_FOR_GROUP

    if is_group:
        gq = quality.group_quality(img_path, faces)
        return (
            cfg.WEIGHT_GROUP_QUALITY * gq
            + cfg.WEIGHT_GROUP_BLUR * blur_norm
        )
    else:
        smile = quality.smile_for_face(img_path, matched_face) / cfg.SMILE_DIVISOR
        facing = 1.0 if quality.facing_camera(matched_face) else 0.0
        return (
            cfg.WEIGHT_SINGLE_SMILE * smile
            + cfg.WEIGHT_SINGLE_FACING * facing
            + cfg.WEIGHT_SINGLE_BLUR * blur_norm
        )


def rank_photos(
    ref_img_path: str,
    photo_paths: List[str],
    finder: PersonFinder | None = None,
    top_k: int | None = None,
    progress_callback=None,
    verbose: bool = False,
) -> List[Tuple[str, float]]:
    """
    Rank photos by quality for the person in ref_img_path.

    - ref_img_path: path to one reference photo of the person
    - photo_paths: list of paths to candidate photos
    - finder: optional pre-built PersonFinder (else created internally)
    - top_k: if set, return only top_k results (still sorted)
    - progress_callback: optional fn(processed_count, total_count) for progress

    Returns list of (path, score) sorted by score descending.
    """
    quality = QualityScorer()
    if finder is None:
        finder = PersonFinder()
    if not finder.set_reference(ref_img_path):
        return []

    total = len(photo_paths)
    scored: List[Tuple[str, float]] = []
    for i, path in enumerate(photo_paths):
        if not os.path.isfile(path):
            continue
        if verbose:
            max_sim = finder.get_max_similarity(path)
            print(f"  {path}: max_similarity={max_sim:.3f}", file=sys.stderr)
        score = _final_score(path, finder, quality)
        if score > 0:
            scored.append((path, score))
        if progress_callback and total:
            progress_callback(i + 1, total)

    scored.sort(key=lambda x: x[1], reverse=True)
    if top_k is not None and top_k > 0:
        scored = scored[:top_k]
    return scored
