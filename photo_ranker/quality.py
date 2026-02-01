"""
Quality signals: blur, smile (emotion), facing camera, group quality.
DeepFace is imported lazily so the app runs even when TensorFlow/tf_keras is missing.
"""

import cv2
import numpy as np

import config as cfg


def blur_score(img_path: str) -> float:
    """Laplacian variance; higher = sharper."""
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return 0.0
    return float(cv2.Laplacian(img, cv2.CV_64F).var())


def _facing_camera(face) -> bool:
    """Use head pose if available; else fallback to det_score as proxy."""
    pose = getattr(face, "pose", None)
    if pose is not None and len(pose) >= 2:
        # pose often (pitch, yaw, roll) in degrees
        pitch, yaw = abs(pose[0]), abs(pose[1])
        return pitch <= cfg.POSE_PITCH_MAX_DEG and yaw <= cfg.POSE_YAW_MAX_DEG
    # Fallback: high detection score often means frontal
    return getattr(face, "det_score", 0) >= cfg.MIN_DET_SCORE_FOR_GOOD_FACE


def smile_score_face_crop(crop_bgr: np.ndarray) -> float:
    """Emotion 'happy' 0--100 for a face crop. Uses DeepFace if available."""
    if crop_bgr is None or crop_bgr.size == 0:
        return 0.0
    try:
        from deepface import DeepFace
    except Exception:
        return 0.0
    try:
        result = DeepFace.analyze(crop_bgr, actions=["emotion"], enforce_detection=False)
        if result and isinstance(result, list):
            result = result[0]
        emotions = result.get("emotion") or {}
        return float(emotions.get("happy", 0.0))
    except Exception:
        return 0.0


def smile_score_from_bbox(img_path: str, bbox) -> float:
    """Crop face from image and return smile (happy) score. bbox: (x1,y1,x2,y2)."""
    img = cv2.imread(img_path)
    if img is None or bbox is None:
        return 0.0
    x1, y1, x2, y2 = [int(round(x)) for x in bbox[:4]]
    h, w = img.shape[:2]
    x1, x2 = max(0, x1), min(w, x2)
    y1, y2 = max(0, y1), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return 0.0
    crop = img[y1:y2, x1:x2]
    return smile_score_face_crop(crop)


def group_quality(img_path: str, faces) -> float:
    """Fraction of faces that are 'good' (facing camera, confident detection)."""
    if not faces or len(faces) < cfg.MIN_FACES_FOR_GROUP:
        return 0.0
    good = sum(
        1
        for f in faces
        if _facing_camera(f) and getattr(f, "det_score", 0) >= cfg.MIN_DET_SCORE_FOR_GOOD_FACE
    )
    return good / len(faces)


class QualityScorer:
    """Uses config for thresholds; provides blur, facing, smile, group_quality."""

    @staticmethod
    def blur_normalized(img_path: str) -> float:
        """Blur score normalized to ~[0,1] using config divisor; capped at 1."""
        raw = blur_score(img_path)
        return min(1.0, raw / cfg.BLUR_NORMALIZE_DIVISOR)

    @staticmethod
    def is_too_blurry(img_path: str) -> bool:
        return blur_score(img_path) < cfg.BLUR_REJECT_THRESHOLD

    @staticmethod
    def facing_camera(face) -> bool:
        return _facing_camera(face)

    @staticmethod
    def smile_for_face(img_path: str, face) -> float:
        """0--100 from DeepFace; we'll divide by 100 in scorer."""
        bbox = getattr(face, "bbox", None)
        return smile_score_from_bbox(img_path, bbox) if bbox is not None else 0.0

    @staticmethod
    def group_quality(img_path: str, faces) -> float:
        return group_quality(img_path, faces)
