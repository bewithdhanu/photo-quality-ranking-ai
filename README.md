# Photo Quality Ranking

Find and rank the best photos of a person across your albums. Upload photos, detect faces, name people once and have them recognized everywhere, then see quality-ranked results (smile, pose, sharpness).

---

## How the application works

### Web app (recommended)

1. **Albums** — Create albums (e.g. “Trip 2024”). Upload photos (JPEG, PNG, WebP, BMP). Start processing; the backend detects faces, builds a metadata cache, and clusters unique people per album.

2. **People** — After processing, each album shows a **People** tab with detected faces. Give someone a name (e.g. “Jane”); that identity is stored globally so the same person is recognized in other albums.

3. **Find person by photo** — Upload one photo of a person. The app matches it against **global people** and **all album face embeddings**. You get a confident match or up to three possible matches; pick one to see that person’s albums and photos.

4. **Photo details & tagging** — Open any photo from an album or from Find Person. You see the image with face boxes, prev/next arrows, and bottom thumbnails. In the sidebar you can name or correct names for each face; names sync to the global registry.

5. **Ranked photos** — From an album’s People tab, open a person to see their **best photos** for that album, ranked by quality (smile, facing camera, sharpness; for group photos, overall group quality + sharpness).

6. **Management** — Rename or delete albums, remove photos from an album, or remove a person from an album (they stay in the global list).

### CLI (optional)

You can run the same ranking engine from the command line with a reference photo and a folder of candidates. See [Usage](#usage) and [Project layout](#project-layout) below.

---

## Setup

**Requirements:** Python 3.9+ (backend), Node.js 18+ (frontend). Use a virtualenv for Python.

### Backend

```bash
cd photo-quality-ranking-ai
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**First run:** insightface downloads ONNX models (a few hundred MB) on first use. Ensure internet is available.

### Frontend

```bash
cd frontend
npm install
```

### Run the web app

**Option A — One-command setup and run (recommended)**

- **Linux / macOS:**  
  `./setup-and-run.sh`  
  Creates venv (if needed), installs backend and frontend dependencies, starts backend and frontend, and opens the frontend in your browser. Press Ctrl+C in the terminal to stop both.

- **Windows:**  
  `setup-and-run.bat`  
  Same flow: creates venv, installs dependencies, starts backend and frontend in separate windows, opens the browser. Close the Backend and Frontend command windows to stop.

**Option B — Manual**

1. **Backend** (from project root, with `.venv` active):

   ```bash
   cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Frontend** (in another terminal):

   ```bash
   cd frontend && npm run dev
   ```

3. Open **http://localhost:5173** (or the port Vite prints). Set `VITE_API_URL=http://localhost:8000` if the API runs elsewhere.

---

## Usage (CLI)

**Basic:** reference photo + folder of candidates, get top 20 ranked paths.

```bash
python run_rank.py --ref path/to/person.jpg --photos path/to/photo_folder/ --top 20
```

**With output file:**

```bash
python run_rank.py --ref person.jpg --photos ./photos/ --top 30 --output ranked.txt
```

**Discover faces in album, then rank by selection:**

1. List unique faces and save representative crops:  
   `python run_rank.py --photos ./album --list-faces`

2. Rank photos for one person by index:  
   `python run_rank.py --photos ./album --select 0 --top 20`

**Metadata cache:** The first run builds `.photo_ranker_metadata.json` in the photo folder. Later runs only process new or changed files. Use `--no-cache` to force full recompute.

---

## How quality is decided

- **Blur:** Laplacian variance (OpenCV). Low sharpness penalizes the score.
- **Single photo:** Smile (DeepFace “happy”) + facing camera (insightface head pose) + sharpness.
- **Group photo:** Fraction of faces that are “good” (facing camera, confident) + sharpness. The target person must appear; we score overall group quality and sharpness.

Weights and thresholds are in `config.py`.

---

## Project layout

```
photo-quality-ranking-ai/
├── README.md
├── requirements.txt
├── config.py              # Thresholds and weights
├── run_rank.py            # CLI entry point
├── backend/               # FastAPI web API
│   ├── main.py            # Routes, CORS
│   ├── albums.py          # Album CRUD, processing, find-person
│   └── global_people.py   # Global person registry (names + embeddings)
├── photo_ranker/          # Core engine (face detection, quality, ranking)
│   ├── person_finder.py   # insightface: embedding, “person in photo?”
│   ├── quality.py        # Blur, smile, facing camera, group quality
│   ├── metadata.py       # Cache: sync, load/save, score from store
│   ├── unique_faces.py   # Cluster faces by identity, representative crops
│   └── ranker.py         # Scoring + ranking (live and from metadata)
├── frontend/              # React + Vite + TypeScript
│   └── src/
│       ├── App.tsx        # Routes
│       ├── lib/           # API client, types
│       └── pages/         # Home, AlbumView, Upload, PhotoDetail, FindPersonResult, etc.
└── docs/
    ├── TECHNICAL.md       # Backend/frontend/architecture details
    └── LOVABLE_UI_BUILD_PROMPT.md
```

---

## Documentation

- **[docs/TECHNICAL.md](docs/TECHNICAL.md)** — Technical details: how the backend works (API, albums, global people, face matching, processing pipeline), how the frontend works (routes, API client, state), and architecture.

---

## Limitations

- “Nice pose” is approximated (facing camera + smile), not a full pose aesthetic model.
- Very small faces (&lt; ~30px) are ignored.
- Group “good” is majority-facing-camera + sharp; no explicit occlusion model.
- DeepFace is relatively slow during initial metadata sync; after that, matching uses the cache.
- insightface model licensing may be non-commercial; check if you use this commercially.
