"""
Configurable thresholds and weights for photo ranking.
Tune these without touching the main logic.
"""

# --- Person matching (embedding similarity) ---
SIMILARITY_THRESHOLD = 0.45  # Min cosine similarity to consider "same person" (0.45–0.6 typical)
MIN_FACE_SIZE_PX = 30       # Ignore faces smaller than this (width or height)

# --- Blur (Laplacian variance) ---
BLUR_REJECT_THRESHOLD = 100   # Unused: blur now only penalizes score (no hard reject)
BLUR_ACCEPTABLE = 300         # Above this considered sharp; used for normalizing
BLUR_NORMALIZE_DIVISOR = 500  # blur / this → cap at 1.0 for score

# --- Head pose (degrees) - "facing camera" ---
POSE_YAW_MAX_DEG = 15
POSE_PITCH_MAX_DEG = 15

# --- Group photo ---
MIN_FACES_FOR_GROUP = 2
MIN_DET_SCORE_FOR_GOOD_FACE = 0.7  # Detection confidence for "reliable" face

# --- Scoring weights (must sum to 1.0 per branch) ---
# Single photo: smile + facing_camera + sharpness
WEIGHT_SINGLE_SMILE = 0.4
WEIGHT_SINGLE_FACING = 0.3
WEIGHT_SINGLE_BLUR = 0.3

# Group photo: group_quality + sharpness
WEIGHT_GROUP_QUALITY = 0.7
WEIGHT_GROUP_BLUR = 0.3

# --- Emotion (smile) ---
SMILE_DIVISOR = 100.0  # DeepFace returns 0–100; we use score/100

# --- Metadata cache ---
METADATA_FILENAME = ".photo_ranker_metadata.json"
METADATA_VERSION = 1

# --- Unique faces (list/select) ---
FACE_CROP_DIR = ".photo_ranker_faces"  # Subdir inside photo folder for face crops
FACE_CROP_SIZE = 256  # Size of saved face thumbnails
