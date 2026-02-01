# Photo Quality Ranking App — UI Build Prompt for Lovable

Use this as the main spec to build the frontend. The backend is a **FastAPI** app; you are building a **React** SPA that talks to it. Focus on **polish, clarity, and a distinct visual identity**—avoid generic “AI slop” aesthetics.

---

## 1. Product summary

**Photo Quality Ranking** is a web app that:

1. Lets users create **albums** and **upload photos**.
2. **Processes** each album in the background (face detection, embeddings, quality signals).
3. Shows **unique people** detected across the album (one representative face per person).
4. Lets the user **pick a person** and see their **best photos ranked by quality** (smile, pose, blur, etc.).
5. On **photo detail**, shows **face boxes** on the image and lets users **name** each detected person (e.g. “Mom”, “Dad”). Names are stored per album and reused everywhere.

**User flow:** Home (albums) → Create album → Upload photos → Start processing → Album view (people grid) → Pick person → Ranked photos grid → Click photo → Image detail (faces + naming).

---

## 2. Tech stack (non‑negotiable)

- **React 18+** with **TypeScript**.
- **Vite** as build tool.
- **React Router v6** (or v7) with a single layout and nested routes.
- **Tailwind CSS** for styling.
- **shadcn/ui** (Radix-based) for accessible primitives: Button, Card, Input, and any dialogs/tooltips you add. Use the `cn()` utility and the project’s design tokens.
- **No** Redux/MobX unless you have a strong reason; local state + React Router is enough.
- **API base URL:** `http://localhost:8000` by default, overridable via env (e.g. `VITE_API_URL`).

---

## 3. Design direction

- **Vibe:** Modern photo app / gallery—clean, confident, a bit editorial. Think “photo manager that respects the images,” not “dashboard.”
- **Avoid:** Generic purple gradients, Inter‑everywhere, flat cards with no hierarchy, cluttered headers.
- **Do:**  
  - Clear typography hierarchy (one strong font for headings, optional second for body).  
  - Generous whitespace; let photos and face crops be the main visual.  
  - Subtle borders/shadows and hover states so cards and buttons feel tappable.  
  - **Dark and light themes** with a toggle in the header; persist choice (e.g. localStorage) and respect `prefers-color-scheme` on first load.
- **Responsive:** Mobile-first. Grids should collapse to 1–2 columns on small screens; header and CTAs must work on touch.
- **Accessibility:** Focus rings, semantic HTML, `aria-label` on icon-only buttons, and keyboard-friendly navigation where it makes sense.

---

## 4. Routes and layout

**Layout (wraps all pages):**

- Sticky header with: app name/logo (link to `/`), then theme toggle (sun/moon).
- Main content area: `max-width` container, consistent horizontal padding.

**Routes (all under the layout):**

| Path | Purpose |
|------|--------|
| `/` | Home: list albums, create new album. |
| `/album/:albumId` | Album view: processing status or grid of unique people. |
| `/album/:albumId/upload` | Upload: add photos to album, then “Finish & process”. |
| `/album/:albumId/person/:personIndex` | Person’s ranked photos (best first). |
| `/album/:albumId/photo/:filename` | Single photo detail: image + face boxes + list of faces with “Name” action. |

**Navigation:**

- From Home: “New album” → create album → redirect to `/album/:albumId/upload`.
- From Album view: link to “Upload photos” → `/album/:albumId/upload`; each person card links to `/album/:albumId/person/:personIndex`.
- From Person photos: back to album (e.g. breadcrumb or back button to `/album/:albumId`); each photo links to `/album/:albumId/photo/:filename` (encode filename in URL).
- From Image detail: back to album or back to person’s photos (your choice; at least one clear “Back”).

---

## 5. API contract (must match exactly)

**Base URL:** `http://localhost:8000` (or `VITE_API_URL`).

**All responses are JSON unless noted.**

| Method | Endpoint | Body/Query | Response |
|--------|----------|------------|----------|
| GET | `/api/albums` | — | `Array<{ id: string, name: string, status: string }>` |
| POST | `/api/albums` | Query: `name?` | `{ id: string, name: string, status: string }` |
| GET | `/api/albums/:albumId` | — | `{ id, name, status, person_names?: Record<string, string \| null> }` or 404 |
| GET | `/api/albums/:albumId/status` | — | `{ status: string, error?: string }` |
| POST | `/api/albums/:albumId/upload` | `FormData` with key `files` (array of files) | `{ saved: string[] }` |
| POST | `/api/albums/:albumId/process` | — | `{ status: "processing" }` |
| GET | `/api/albums/:albumId/people` | — | `Array<{ index: number, crop_url_path: string, name?: string \| null, count: number }>` |
| PATCH | `/api/albums/:albumId/people/:personIndex` | `{ name: string }` | `{ ok: true }` |
| GET | `/api/albums/:albumId/people/:personIndex/photos` | Query: `top_k?` (default 200) | `Array<{ path: string, score: number, url_path?: string }>` |
| GET | `/api/albums/:albumId/photos/:filename` | — | **Binary image** (e.g. image/jpeg) |
| GET | `/api/albums/:albumId/faces/:cropName` | — | **Binary image** (face crop, e.g. person_0.jpg) |
| GET | `/api/albums/:albumId/photos/:filename/faces` | — | `Array<{ face_index: number, person_index: number \| null, bbox: number[], name?: string \| null }>` |

**Notes:**

- `status` for an album: `"pending"` (no processing yet), `"processing"` (running), `"done"` (ready), `"error"` (with `error` in status response).
- `crop_url_path` is a path like `/api/albums/:id/faces/person_0.jpg`; frontend must prepend base URL for `<img src>`.
- `bbox` is `[x1, y1, x2, y2]` in image coordinates; use it to overlay rectangles on the photo (scale by displayed image size).
- For photo/face image URLs: build as `BASE_URL + path` and encode filename in path when needed.

---

## 6. Page-by-page specs

### 6.1 Home (`/`)

- **Data:** `GET /api/albums`. Show list of albums.
- **UI:**
  - Page title (e.g. “Albums”) and a primary CTA: “New album” (or “Create album”).
  - If list is empty: friendly empty state (icon + short copy + same CTA).
  - If list has items: grid of cards (e.g. 2–3 columns on desktop). Each card: album name, status badge (Pending / Processing / Done / Error), optional thumbnail or icon. Card is clickable → `/album/:albumId`.
- **Create album:** Call `POST /api/albums`, then redirect to `/album/{returned.id}/upload`. Show loading on the button during request.

### 6.2 Upload (`/album/:albumId/upload`)

- **Data:** No initial list required; optional: `GET /api/albums/:albumId` to show album name in header/breadcrumb.
- **UI:**
  - Title/subtitle: e.g. “Add photos to [album name]”.
  - **File input:** Multiple, `accept="image/*"`. Prefer a drag-and-drop zone (visual feedback on drag over) plus “Browse” fallback.
  - After selecting files: show count and an “Upload” button. On submit: `POST /api/albums/:albumId/upload` with `FormData` (key `files`). On success: clear selection and optionally show “Uploaded N files” or list of `saved` names.
  - Separate prominent button: “Finish & process album”. Calls `POST /api/albums/:albumId/process`, then redirects to `/album/:albumId`. Disable or show loading while request is in flight.
- **Validation:** Only send image types the backend accepts (e.g. jpg, jpeg, png, webp, bmp). Optional: client-side filter and error message for unsupported types.

### 6.3 Album view (`/album/:albumId`)

- **Data:** `GET /api/albums/:albumId`, `GET /api/albums/:albumId/status` (poll every 2–3 s until not `processing`), then if `status === "done"` call `GET /api/albums/:albumId/people`.
- **States:**
  - **Loading / no album:** Show spinner or “Album not found.”
  - **status === "processing":** Full-width or card message: “Processing album… Detecting faces and building metadata.” Optional subtle progress or pulse animation.
  - **status === "error":** Error card with `status.error` message and optional “Retry” (e.g. go to upload and trigger process again).
  - **status === "pending":** Short copy: “No photos processed yet.” CTA: “Upload photos & process” → link to `/album/:albumId/upload`.
  - **status === "done":** Show album title and subtitle (“Select a person to see their best photos”). Grid of **people cards**: each card = face crop image (from `crop_url_path`), display name (person’s `name` or “Person 0”, “Person 1”, …), and photo count. Card links to `/album/:albumId/person/:personIndex`. If people array is empty: empty state “No faces detected. Upload more photos and process again.”

### 6.4 Person photos (`/album/:albumId/person/:personIndex`)

- **Data:** `GET /api/albums/:albumId`, `GET /api/albums/:albumId/people`, `GET /api/albums/:albumId/people/:personIndex/photos`.
- **UI:**
  - Back navigation (to album).
  - Heading: person’s display name (from people list); subtext: “[Album name] · Ranked by quality”.
  - Grid of photos (responsive). Each item: image (use backend photo URL), optional score badge (e.g. “Score: 0.85”). Click → `/album/:albumId/photo/:path` (encode `path` in URL).
  - Empty: “No photos found for this person.”
  - Loading: skeleton grid or spinner.

### 6.5 Image detail (`/album/:albumId/photo/:filename`)

- **Data:** `GET /api/albums/:albumId/photos/:filename/faces`, `GET /api/albums/:albumId/people`. Decode `filename` from URL (e.g. `decodeURIComponent`).
- **UI:**
  - Back link/button (to album or to person’s photo list).
  - Title: “Photo: [filename]” or a shorter label.
  - **Left (or top on mobile):** Large image (backend URL for this photo). When image has loaded, overlay **face rectangles** using `bbox`: scale `[x1,y1,x2,y2]` to the displayed image size (not naturalWidth/Height if you scale the img with CSS; use a wrapper and percentage-based positioning or same aspect-ratio overlay).
  - **Right (or below):** Card “People in this photo.” List each face: “Face 1: [display name]” where display name = person’s `name` or “Person N” or “Unknown” if `person_index === null`. Per face: “Name” button → inline edit (input + Save/Cancel). Save calls `PATCH /api/albums/:albumId/people/:personIndex` with `{ name: string }`. Update local state so the list and overlays reflect the new name without full reload.
  - If no faces: “No faces detected in this photo.”

---

## 7. API client (recommended shape)

- Single module (e.g. `src/lib/api.ts`) with:
  - `API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"`.
  - Typed functions for each endpoint (return Promises; throw on non‑2xx or parse error message from JSON body).
  - Helper to build image URLs: e.g. `photoUrl(albumId, filename)`, `faceCropUrl(albumId, cropPath)` (cropPath can be full path or just `person_0.jpg`).
- Types: `Album`, `Person`, `RankedPhoto`, `FaceInPhoto` matching the API responses above.
- Upload: use `fetch` with `FormData`, key `files`, append each selected file; do not set `Content-Type` (browser sets multipart boundary).

---

## 8. Polish checklist

- [ ] Theme toggle in header; persistence and system preference on first load.
- [ ] Loading states for every async screen (spinner or skeleton).
- [ ] Error states: network/API errors with short message and retry or navigation.
- [ ] Empty states: no albums, no people, no photos—each with clear next action.
- [ ] Breadcrumbs or back buttons so users always know where they are.
- [ ] Face overlays on image detail: correct scale and no layout shift after image load.
- [ ] Naming: inline edit with Save/Cancel; optimistic or immediate update in UI after PATCH.
- [ ] Responsive grids and touch-friendly targets.
- [ ] No raw filename in UI unless needed (e.g. image detail title); prefer “Photo” or truncated name.
- [ ] Accessible: focus visible, labels on icon buttons, semantic headings.

---

## 9. Out of scope for this prompt

- Backend implementation (already exists).
- Auth/login.
- Deleting albums or photos.
- Re-ranking or re-processing from the UI (backend can support it later).

Use this document as the single source of truth for building the Photo Quality Ranking UI. Match the API and routes exactly; interpret “Design direction” and “Page-by-page specs” to produce a cohesive, polished interface that fits a photo-focused product.
