# Technical documentation

This document describes how the backend and frontend work, the API, and the architecture.

---

## Overview

- **Backend:** FastAPI (Python). Serves albums, uploads, processing, face matching, and photo/face assets. Uses the `photo_ranker` core for face detection (insightface), quality scoring (blur, smile, pose), and ranking.
- **Frontend:** React (TypeScript) with Vite, React Router, TanStack Query, and shadcn/ui. Calls the backend REST API and renders albums, people, photos, and the find-person flow.
- **Data:** Albums and photos live under `user-data/albums/<album_id>/`. Global person identities (names + embeddings) live in `user-data/global_people.json`. Per-album metadata (embeddings, blur, pose, emotion) lives in `.photo_ranker_metadata.json` inside each album folder.

---

## Backend

### Stack

- **FastAPI** — HTTP API, CORS, file uploads, `FileResponse` for images.
- **photo_ranker** — insightface (face detection + embeddings), OpenCV (blur), DeepFace (smile/emotion), custom ranker and metadata cache.
- **Storage** — File system: `user-data/albums/<album_id>/` for photos and album metadata; `user-data/global_people.json` for global people.

### Entry point and CORS

- **Entry:** `backend/main.py`. Run with `uvicorn main:app --reload --host 0.0.0.0 --port 8000` from the `backend/` directory (or project root with correct `sys.path`).
- **CORS:** Allowed origins include `localhost:5173`, `localhost:8080`, `localhost:3000`, `localhost:4173` (and 127.0.0.1 variants) for local frontend dev.

### Modules

| Module | Role |
|--------|------|
| **main.py** | FastAPI app, lifespan, CORS; defines all REST routes and delegates to `albums` / file serving. |
| **albums.py** | Album CRUD, uploads, processing trigger, list photos/people, set person name, delete photo/person, ranked photos, faces in photo; **find-person** (embedding from upload → match against global + album faces); **get person albums/photos** (by global id or `album:album_id:person_index`). Uses `photo_ranker` (metadata, unique_faces, person_finder, quality, ranker) and `global_people`. |
| **global_people.py** | Load/save `user-data/global_people.json`; list/add/update people (id, name, embedding); **find_best_match(embedding, threshold)**; **get_top_matches(embedding, top_k)**; **get_person(id)**. |

### Processing pipeline (per album)

1. **Upload** — Photos saved under `user-data/albums/<album_id>/`.
2. **Start process** — `albums.start_processing(album_id)` runs in a background thread. It:
   - Calls `metadata.sync_metadata(album_path, finder, quality, ...)` to build/update `.photo_ranker_metadata.json` (face embeddings, blur, pose, emotion per image).
   - Calls `unique_faces.get_unique_faces(metadata, path)` to cluster faces by identity (cosine similarity ≥ `SIMILARITY_THRESHOLD`) and get one representative per person.
   - Tries to match each cluster to existing **global people** by embedding; if a match is found, links that cluster to the global id.
   - Saves face crops to `.photo_ranker_faces/person_0.jpg`, etc., and sets album status to `done` (or `error` with message).
3. **Get people** — Reads album metadata and unique faces; merges in global names from `person_global_ids` and `global_people`.
4. **Set person name** — Creates or updates a global person (name + representative embedding) and links the album cluster to that global id.
5. **Ranked photos** — Uses `ranker.rank_photos_from_metadata` with the selected person’s embedding; returns photos sorted by quality score.

### Find-person flow

1. **POST /api/find-person** — Receives an image file. Saves to a temp file (correct extension from magic bytes for decoding). Uses `PersonFinder.get_embedding(path)` (insightface) to get one face embedding.
2. **Search** — Builds a combined candidate list: **(a)** all global people (id, name, embedding), **(b)** all unique-face representatives from every processed album (id = global id if linked, else `album:album_id:person_index`). Computes cosine similarity between upload embedding and each candidate.
3. **Response** — Uses `FIND_PERSON_SIMILARITY_THRESHOLD` (0.28) for a confident match. Returns `matched`, `person`, `albums`, `photos`, `best_similarity`, and **top 3 candidates** (id, name, similarity) so the UI can offer “possible matches” when there’s no confident match.
4. **Get albums/photos for a chosen person** — **GET /api/people/{id}/albums-photos** accepts either a global uuid or `album:album_id:person_index` and returns `{ person, albums, photos }`.

### Config (config.py)

- **Person matching:** `SIMILARITY_THRESHOLD` (0.45) for clustering and linking; `FIND_PERSON_SIMILARITY_THRESHOLD` (0.28) for find-person; `MIN_FACE_SIZE_PX` (30).
- **Blur / pose / group / weights:** Used by `photo_ranker` (quality, ranker). See `config.py` and the main README.

### API summary (backend)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check. |
| POST | `/api/find-person` | Upload image; return match + top 3 candidates + albums/photos if matched. |
| GET | `/api/people/{id}/albums-photos` | Albums and photos for a person (global id or `album:album_id:person_index`). |
| GET | `/api/albums` | List albums. |
| POST | `/api/albums` | Create album. |
| GET | `/api/albums/{id}` | Get album. |
| PATCH | `/api/albums/{id}` | Rename album. |
| DELETE | `/api/albums/{id}` | Delete album. |
| GET | `/api/albums/{id}/status` | Processing status. |
| POST | `/api/albums/{id}/upload` | Upload photo files. |
| POST | `/api/albums/{id}/process` | Start background processing. |
| GET | `/api/albums/{id}/people` | List people (with global names). |
| PATCH | `/api/albums/{id}/people/{index}` | Set person name (global). |
| DELETE | `/api/albums/{id}/people/{index}` | Remove person from album. |
| GET | `/api/albums/{id}/people/{index}/photos` | Ranked photos for that person. |
| GET | `/api/albums/{id}/photos` | List photo filenames. |
| GET | `/api/albums/{id}/photos/{filename}` | Serve image file. |
| DELETE | `/api/albums/{id}/photos/{filename}` | Delete photo. |
| GET | `/api/albums/{id}/photos/{filename}/faces` | Faces in photo (with person index, bbox, name). |
| GET | `/api/albums/{id}/faces/{crop_name}` | Serve face crop image. |

---

## Frontend

### Stack

- **React 18** + **TypeScript**.
- **Vite** — Build and dev server.
- **React Router v6** — Routes and navigation.
- **TanStack Query** — Server state (albums, people, photos, status).
- **shadcn/ui** — UI components (Button, Dialog, Tabs, etc.); **Tailwind CSS** for layout and styling.
- **Sonner / Toaster** — Toasts.

### Entry and layout

- **Entry:** `frontend/src/main.tsx` → `App.tsx` with `QueryClientProvider`, `ThemeProvider`, `BrowserRouter`, `Routes`.
- **Layout:** `Layout` wraps all routes except 404; contains the app header and `<Outlet />` for the current route. Main content uses `container` and padding.

### Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | Home | List albums, create/rename/delete album, “Find person by photo” (opens dialog → then navigates to result page). |
| `/album/:albumId` | AlbumView | Album header, **tabs:** Photos | People. Photos: grid with links to photo detail; People: grid of person cards with link to ranked photos. |
| `/album/:albumId/upload` | Upload | Drag-and-drop upload; start process. |
| `/album/:albumId/person/:personIndex` | PersonPhotos | Ranked photos for that person in the album. |
| `/album/:albumId/photo/:filename` | PhotoDetail | Full image (fixed height, centered, letterboxing), prev/next arrows, bottom thumbnails, “People in this photo” sidebar (name/edit), delete photo. |
| `/find-person/result` | FindPersonResult | Result of find-person: matched person or “possible matches”; albums and photos; clicking a photo goes to PhotoDetail for that album/photo. |
| `*` | NotFound | 404 page. |

### API client and types

- **API base:** `frontend/src/lib/api.ts` — `API_BASE` from `VITE_API_URL` or `http://localhost:8000`. All requests go to `API_BASE + path`.
- **Types:** `frontend/src/lib/types.ts` — `Album`, `Person`, `AlbumPhoto`, `RankedPhoto`, `FindPersonResult`, `FindPersonCandidate`, `PersonAlbumsPhotosResult`, etc.
- **Functions:** `getAlbums`, `createAlbum`, `getAlbum`, `renameAlbum`, `deleteAlbum`, `getAlbumStatus`, `listAlbumPhotos`, upload, `startProcessing`, `getPeople`, `updatePersonName`, `getRankedPhotos`, `getPhotoFaces`, `findPersonByPhoto`, `getPersonAlbumsPhotos`, `photoUrl`, `faceCropUrl`, etc. Photo and face URLs point at backend paths like `/api/albums/{id}/photos/{filename}` and `/api/albums/{id}/faces/{crop_name}`.

### State and data flow

- **Server state:** TanStack Query (`useQuery`) for albums, album, status, people, album photos, ranked photos, faces in photo. Keys like `["album", albumId]`, `["people", albumId]`, `["albumPhotos", albumId]`. Mutations (create, rename, delete, upload, process, set name) invalidate relevant queries or use `queryClient.invalidateQueries`.
- **Find person:** User picks a file in a dialog on Home → POST find-person → navigate to `/find-person/result` with `state: { findResult }`. FindPersonResult shows match or candidates; choosing a candidate fetches `getPersonAlbumsPhotos(id)` and shows albums/photos; photo links go to PhotoDetail.
- **PhotoDetail:** Loads album photos via `listAlbumPhotos(albumId)` to compute prev/next and thumbnails; current photo from `useParams`; faces from `getPhotoFaces(albumId, filename)`. Layout: no vertical scroll; fixed-height image area with centered `object-contain`; thumbnails fixed at bottom.

### Build and env

- **Dev:** `npm run dev` (Vite).
- **Build:** `npm run build`; output in `dist/`.
- **Env:** `VITE_API_URL` for API base URL (optional).

---

## Architecture (data flow)

1. **Albums and photos** — Stored on disk under `user-data/albums/<album_id>/`. Album metadata (name, status, `person_global_ids`, `deleted_person_indices`) in `.album.json` in that folder.
2. **Processing** — On “Start process”, backend runs metadata sync (insightface + OpenCV + DeepFace) and writes `.photo_ranker_metadata.json`; then unique-face clustering and optional linking to global people; face crops under `.photo_ranker_faces/`.
3. **Global people** — One JSON file: `user-data/global_people.json`. Each person: `id` (uuid), `name`, `embedding` (list of floats). Names are shared across albums via `person_global_ids` in each album’s `.album.json`.
4. **Find person** — Upload → one embedding. Compared to **(a)** all global people and **(b)** all album unique-face representatives. Best match above threshold or top 3 candidates returned; UI can then request albums/photos for a chosen id (global or `album:...`).
5. **Ranking** — For a given person (by album + person index, or by global id resolved to album + index), backend uses that person’s representative embedding and `ranker.rank_photos_from_metadata` to score and sort photos; frontend displays the list (e.g. PersonPhotos, or photos in FindPersonResult).

---

## File and folder reference

- **user-data/global_people.json** — Global person registry.
- **user-data/albums/<album_id>/** — Album folder: photos, `.album.json`, `.photo_ranker_metadata.json`, `.photo_ranker_faces/`.
- **config.py** — Similarity thresholds, weights, metadata filename, face crop dir, etc.
- **photo_ranker/** — Reusable core: person_finder, quality, metadata, unique_faces, ranker (used by both CLI and backend).
