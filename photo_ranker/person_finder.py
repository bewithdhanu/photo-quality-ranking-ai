"""
Find whether a target person (from reference photo) appears in a photo.
Uses insightface for detection and embedding + cosine similarity.
"""

import os
import numpy as np
import cv2

try:
    from insightface.app import FaceAnalysis
except ImportError:
    FaceAnalysis = None

import config as cfg


def _face_size(face) -> int:
    """Minimum of width/height of face bbox."""
    bbox = getattr(face, "bbox", None)
    if bbox is None:
        return 0
    x1, y1, x2, y2 = bbox[:4]
    return int(min(x2 - x1, y2 - y1))


class PersonFinder:
    """Loads insightface once; finds person in images via reference embedding."""

    def __init__(self, det_size=(640, 640)):
        if FaceAnalysis is None:
            raise ImportError("insightface is required. pip install insightface onnxruntime")
        self.app = FaceAnalysis(providers=["CPUExecutionProvider"])
        self.app.prepare(ctx_id=0, det_size=det_size)
        self._ref_embedding = None
        self._ref_img_path = None

    def get_embedding(self, img_path: str):
        """Extract embedding from the first (largest) face in image."""
        img = cv2.imread(img_path)
        if img is None:
            return None
        faces = self.app.get(img)
        if not faces:
            return None
        # Prefer largest face
        faces = sorted(faces, key=lambda f: _face_size(f), reverse=True)
        face = faces[0]
        if _face_size(face) < cfg.MIN_FACE_SIZE_PX:
            return None
        return face.embedding.copy()

    def set_reference(self, ref_img_path: str) -> bool:
        """Set reference person from image. Returns True if a face was found."""
        emb = self.get_embedding(ref_img_path)
        if emb is None:
            return False
        self._ref_embedding = emb
        self._ref_img_path = ref_img_path
        return True

    def get_reference_embedding(self) -> np.ndarray | None:
        """Return the current reference embedding (after set_reference)."""
        return self._ref_embedding.copy() if self._ref_embedding is not None else None

    def person_exists(self, img_path: str):
        """
        Check if reference person appears in image.
        Returns (exists: bool, matched_face or None).
        """
        if self._ref_embedding is None:
            raise RuntimeError("Call set_reference(ref_img_path) first")

        # Same file as reference (e.g. ref is inside the photo folder) → always match
        try:
            ref_abs = os.path.abspath(self._ref_img_path)
            cand_abs = os.path.abspath(img_path)
            if ref_abs == cand_abs or (os.path.exists(ref_abs) and os.path.exists(cand_abs) and os.path.samefile(ref_abs, cand_abs)):
                img = cv2.imread(img_path)
                if img is not None:
                    faces = self.app.get(img)
                    if faces:
                        best = max(faces, key=lambda f: _face_size(f))
                        return True, best
        except OSError:
            pass

        img = cv2.imread(img_path)
        if img is None:
            return False, None
        faces = self.app.get(img)
        ref_norm = np.linalg.norm(self._ref_embedding)
        if ref_norm <= 0:
            return False, None
        for f in faces:
            if _face_size(f) < cfg.MIN_FACE_SIZE_PX:
                continue
            sim = np.dot(self._ref_embedding, f.embedding) / (
                ref_norm * np.linalg.norm(f.embedding)
            )
            if sim >= cfg.SIMILARITY_THRESHOLD:
                return True, f
        return False, None

    def get_max_similarity(self, img_path: str) -> float:
        """Return max cosine similarity of any face in image to reference (for debugging)."""
        if self._ref_embedding is None:
            return 0.0
        img = cv2.imread(img_path)
        if img is None:
            return 0.0
        faces = self.app.get(img)
        ref_norm = np.linalg.norm(self._ref_embedding)
        if ref_norm <= 0:
            return 0.0
        best = 0.0
        for f in faces:
            if _face_size(f) < cfg.MIN_FACE_SIZE_PX:
                continue
            sim = np.dot(self._ref_embedding, f.embedding) / (
                ref_norm * np.linalg.norm(f.embedding)
            )
            best = max(best, float(sim))
        return best

    def get_all_faces(self, img_path: str):
        """Return all detected faces in image (for group quality). Filter by size in caller if needed."""
        img = cv2.imread(img_path)
        if img is None:
            return []
        return self.app.get(img)
