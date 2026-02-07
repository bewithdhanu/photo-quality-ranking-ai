// API Types for Photo Quality Ranking

export interface Album {
  id: string;
  name: string;
  status: "pending" | "processing" | "done" | "error";
  person_names?: Record<string, string | null>;
}

export interface AlbumStatus {
  status: "pending" | "processing" | "done" | "error" | "not_found";
  error?: string;
}

export interface Person {
  index: number;
  crop_url_path: string;
  name?: string | null;
  count: number;
  global_id?: string | null;
}

export interface AlbumPhoto {
  filename: string;
  url_path: string;
}

export interface RankedPhoto {
  path: string;
  score: number;
  url_path?: string;
}

export interface FaceInPhoto {
  face_index: number;
  person_index: number | null;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  name?: string | null;
}

export interface UploadResponse {
  saved: string[];
}

export interface ProcessResponse {
  status: "processing";
}

export interface NameUpdateResponse {
  ok: true;
}

// Candidate from find-person (top match by similarity)
export interface FindPersonCandidate {
  id: string;
  name: string;
  similarity: number;
}

// Find person by photo (match against global people)
export interface FindPersonResult {
  matched: boolean;
  error?: string;
  /** When matched=false, closest similarity score (0–1) for debugging/tuning */
  best_similarity?: number;
  /** Top 3 possible matches (so user can pick when no confident match) */
  candidates?: FindPersonCandidate[];
  person?: { id: string; name: string };
  albums?: { id: string; name: string }[];
  photos?: {
    album_id: string;
    album_name: string;
    filename: string;
    url_path: string;
    score?: number;
  }[];
}

// Result when loading albums/photos for a selected candidate
export interface PersonAlbumsPhotosResult {
  person: { id: string; name: string };
  albums: { id: string; name: string }[];
  photos: {
    album_id: string;
    album_name: string;
    filename: string;
    url_path: string;
    score?: number;
  }[];
}
