import type {
  Album,
  AlbumStatus,
  Person,
  AlbumPhoto,
  RankedPhoto,
  FaceInPhoto,
  UploadResponse,
  ProcessResponse,
  NameUpdateResponse,
  FindPersonResult,
  PersonAlbumsPhotosResult,
} from "./types";

// API Base URL - configurable via environment variable
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = errorData.detail;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Response wasn't JSON, use default message
    }
    throw new Error(errorMessage);
  }

  // Check if response has content
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }

  return {} as T;
}

// ============== Album Endpoints ==============

export async function getAlbums(): Promise<Album[]> {
  return apiFetch<Album[]>("/api/albums");
}

export async function createAlbum(name?: string): Promise<Album> {
  const params = name ? `?name=${encodeURIComponent(name)}` : "";
  return apiFetch<Album>(`/api/albums${params}`, {
    method: "POST",
  });
}

export async function getAlbum(albumId: string): Promise<Album> {
  return apiFetch<Album>(`/api/albums/${albumId}`);
}

export async function renameAlbum(
  albumId: string,
  name: string
): Promise<Album> {
  return apiFetch<Album>(`/api/albums/${albumId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteAlbum(albumId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/albums/${albumId}`, {
    method: "DELETE",
  });
}

export async function getAlbumStatus(albumId: string): Promise<AlbumStatus> {
  return apiFetch<AlbumStatus>(`/api/albums/${albumId}/status`);
}

// ============== Upload & Processing ==============

export async function uploadPhotos(
  albumId: string,
  files: File[]
): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  return apiFetch<UploadResponse>(`/api/albums/${albumId}/upload`, {
    method: "POST",
    body: formData,
    // Don't set Content-Type - browser will set it with boundary
  });
}

export async function processAlbum(albumId: string): Promise<ProcessResponse> {
  return apiFetch<ProcessResponse>(`/api/albums/${albumId}/process`, {
    method: "POST",
  });
}

// ============== People Endpoints ==============

export async function getPeople(albumId: string): Promise<Person[]> {
  return apiFetch<Person[]>(`/api/albums/${albumId}/people`);
}

export async function listAlbumPhotos(
  albumId: string
): Promise<AlbumPhoto[]> {
  return apiFetch<AlbumPhoto[]>(`/api/albums/${albumId}/photos`);
}

export async function deletePhoto(
  albumId: string,
  filename: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/albums/${albumId}/photos/${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  );
}

export async function deletePersonFromAlbum(
  albumId: string,
  personIndex: number
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/albums/${albumId}/people/${personIndex}`,
    { method: "DELETE" }
  );
}

export async function updatePersonName(
  albumId: string,
  personIndex: number,
  name: string
): Promise<NameUpdateResponse> {
  return apiFetch<NameUpdateResponse>(
    `/api/albums/${albumId}/people/${personIndex}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    }
  );
}

export async function getPersonPhotos(
  albumId: string,
  personIndex: number,
  topK: number = 200
): Promise<RankedPhoto[]> {
  return apiFetch<RankedPhoto[]>(
    `/api/albums/${albumId}/people/${personIndex}/photos?top_k=${topK}`
  );
}

// ============== Photo & Face Endpoints ==============

export async function getPhotoFaces(
  albumId: string,
  filename: string
): Promise<FaceInPhoto[]> {
  return apiFetch<FaceInPhoto[]>(
    `/api/albums/${albumId}/photos/${encodeURIComponent(filename)}/faces`
  );
}

// ============== URL Builders ==============

export function photoUrl(albumId: string, filename: string): string {
  return `${API_BASE}/api/albums/${albumId}/photos/${encodeURIComponent(filename)}`;
}

export function faceCropUrl(albumId: string, cropPath: string): string {
  // cropPath might be full path or just filename
  const filename = cropPath.startsWith("/api/") 
    ? cropPath.split("/").pop() 
    : cropPath;
  return `${API_BASE}/api/albums/${albumId}/faces/${filename}`;
}

// ============== Find person by photo ==============

export async function findPersonByPhoto(file: File): Promise<FindPersonResult> {
  const formData = new FormData();
  formData.append("file", file);
  const url = `${API_BASE}/api/find-person`;
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      if (data.detail) message = data.detail;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json() as Promise<FindPersonResult>;
}

export async function getPersonAlbumsPhotos(personId: string): Promise<PersonAlbumsPhotosResult> {
  return apiFetch<PersonAlbumsPhotosResult>(`/api/people/${encodeURIComponent(personId)}/albums-photos`);
}

// Export API base for debugging
export { API_BASE };
