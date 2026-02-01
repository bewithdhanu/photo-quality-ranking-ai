# Photo Quality Ranking for a Given Person

Given **one reference photo** of a person, this project:

1. **Finds** all photos where that person appears (individual or group).
2. **Classifies** each as single-person or group photo.
3. **Scores** quality (smile/pose for singles; majority-looking-good + sharpness for groups).
4. **Ranks** and returns the best photos first.

---

## Review of the Expert’s Approach

**What’s solid**

- **4-stage pipeline** (find person → single/group → quality signals → weighted score) is the right architecture.
- **insightface** for recognition is a good choice (embeddings + detection in one pass).
- **Blur via Laplacian** (OpenCV) is standard and reliable.
- **“Majority looks good” for groups** is the right rule.
- **No single “aesthetic” model** — combining weak signals is the correct design.

**Improvements added in this project**

| Area | Expert’s suggestion | What we do |
|------|--------------------|------------|
| **Face size** | “Fails if face &lt; 40px” | Explicit **min face size** filter so tiny faces are skipped. |
| **Group + emotion** | DeepFace on full image | **Crop to target person’s face** before emotion/smile so we score the right person. |
| **Config** | Hardcoded thresholds | **Config module** so you can tune blur/smile/similarity without editing code. |
| **CLI** | None | **CLI** with `--ref`, `--photos`, `--top`, `--output` so you can run from terminal. |
| **Progress** | None | **tqdm** for progress over many photos. |
| **Pose fallback** | Assumes `face.pose` exists | **Fallback** when pose is missing (e.g. some insightface models). |
| **First run** | Not mentioned | **README** notes that insightface downloads models on first run. |

**Other suggestions**

- **Caching**: For large sets, you can cache face embeddings per image and only re-run “person match” when the reference changes (not implemented here to keep the script simple; you can add it later).
- **DeepFace speed**: DeepFace loads heavy models. We use it only for the **target face crop** in single-photo scoring to keep it focused and a bit faster.
- **Occlusion**: A better “obstacle” signal would be face visibility (e.g. MediaPipe face mesh). Here we use detection confidence and face size as proxies; you can plug in a visibility model later.
- **Licensing**: insightface models may have non-commercial terms; check if you use this commercially.

---

## Setup

**Requirements:** Python 3.9+, preferably a virtualenv.

```bash
cd photo-quality-ranking-ai
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**First run:** insightface will download ONNX models (a few hundred MB) on first use. Ensure internet is available.

---

## Usage

**Basic:** reference photo + folder of candidates, get top 20 ranked paths.

```bash
python run_rank.py --ref path/to/person.jpg --photos path/to/photo_folder/ --top 20
```

**With output file:** write ranked list to a text file.

```bash
python run_rank.py --ref person.jpg --photos ./photos/ --top 30 --output ranked.txt
```

**Single folder:** all images in `--photos` are considered; subfolders are not scanned (you can extend the script to recurse).

---

## How “good” is decided

- **Blur:** Laplacian variance (OpenCV). Below a threshold → score penalized or zero.
- **Single photo:** Smile (DeepFace emotion “happy”) + facing camera (head pose from insightface) + sharpness.
- **Group photo:** Fraction of faces that are “good” (facing camera, confident detection) + sharpness. We do **not** require the target person to be smiling in the group; we only require that the target person **exists** and that the overall group quality (majority looking at camera, no heavy blur) is high.

Weights and thresholds are in `config.py`; you can tune them there.

---

## Project layout

```
photo-quality-ranking-ai/
├── README.md
├── requirements.txt
├── config.py           # Thresholds and weights
├── run_rank.py         # CLI entry point
└── photo_ranker/
    ├── __init__.py
    ├── person_finder.py  # Embedding + “person in photo?”
    ├── quality.py       # Blur, smile, facing camera, group quality
    └── ranker.py        # Scoring + ranking orchestration
```

---

## Limitations

- “Nice pose” is approximated (e.g. facing camera + smile), not a full pose aesthetic model.
- Very small faces (&lt; ~40px) are ignored.
- Group “good” is majority-facing-camera + sharp; no explicit “obstacle” or occlusion model yet.
- DeepFace is relatively slow; for huge batches, consider caching or a lighter emotion model.

This should give you a **production-style script** that runs on a single machine and ranks photos for a given person with minimal setup.
