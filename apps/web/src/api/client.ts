export type HealthResponse = {
  status: string;
  app: string;
  environment: string;
};

export type ActivityResponse = {
  status: string;
  operation: string | null;
  is_active: boolean;
  playlist_id: string | null;
  playlist_title: string | null;
  video_id: string | null;
  video_title: string | null;
  message: string | null;
  items_completed: number;
  items_total: number | null;
  started_at: string | null;
  updated_at: string | null;
  finished_at: string | null;
};

export type Playlist = {
  id: string;
  source_url: string;
  playlist_id: string | null;
  title: string;
  folder_name: string;
  folder_path: string;
  use_title_as_folder: boolean;
  cookies_browser: string | null;
  resolution_limit: number | null;
  active: boolean;
  last_checked_at: string | null;
  last_downloaded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaylistListResponse = {
  items: Playlist[];
};

export type Video = {
  id: string;
  playlist_id: string;
  video_id: string;
  title: string;
  upload_date: string | null;
  duration_seconds: number | null;
  webpage_url: string;
  thumbnail_url: string | null;
  local_path: string | null;
  downloaded: boolean;
  download_error: string | null;
  downloaded_at: string | null;
  last_seen_at: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type VideoListResponse = {
  items: Video[];
};

export type CreatePlaylistInput = {
  source_url: string;
  title: string;
  folder_name: string;
  folder_path?: string;
  cookies_browser: string | null;
  resolution_limit: number | null;
  active: boolean;
  playlist_id?: string | null;
};

export type UpdatePlaylistInput = Partial<CreatePlaylistInput>;

export const BROWSER_OPTIONS = [
  { value: "", label: "No browser cookies" },
  { value: "chrome", label: "Chrome" },
  { value: "firefox", label: "Firefox" },
  { value: "opera", label: "Opera" },
  { value: "safari", label: "Safari" },
  { value: "atlas", label: "Atlas browser" },
  { value: "comet", label: "Comet browser" },
] as const;

export type SyncPlaylistResponse = {
  playlist_id: string;
  title: string;
  new_videos: number;
  total_videos: number;
};

export type DownloadNewResponse = {
  playlist_id: string;
  title: string;
  attempted_videos: number;
  downloaded_videos: number;
  failed_videos: number;
};

export type LibraryRescanResponse = {
  playlists_scanned: number;
  files_scanned: number;
  relinked_videos: number;
  missing_videos: number;
  unchanged_videos: number;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    let message = `API request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        message = payload.detail;
      }
    } catch {
      // Keep the status-based fallback when the response is not JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

fetchHealth.endpoint = `${API_BASE_URL}/health`;

export async function fetchActivity(): Promise<ActivityResponse> {
  return request<ActivityResponse>("/activity");
}

export async function fetchPlaylists(): Promise<PlaylistListResponse> {
  return request<PlaylistListResponse>("/playlists");
}

export async function createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
  return request<Playlist>("/playlists", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function syncPlaylist(playlistId: string): Promise<SyncPlaylistResponse> {
  return request<SyncPlaylistResponse>(`/playlists/${playlistId}/sync`, {
    method: "POST",
  });
}

export async function fetchPlaylistVideos(playlistId: string): Promise<VideoListResponse> {
  return request<VideoListResponse>(`/playlists/${playlistId}/videos`);
}

export async function downloadNewVideos(
  playlistId: string,
  batchSize: number,
  cookiesBrowser: string | null,
): Promise<DownloadNewResponse> {
  return request<DownloadNewResponse>(`/playlists/${playlistId}/download-new`, {
    method: "POST",
    body: JSON.stringify({ batch_size: batchSize, cookies_browser: cookiesBrowser }),
  });
}

export async function updatePlaylist(
  playlistId: string,
  input: UpdatePlaylistInput,
): Promise<Playlist> {
  return request<Playlist>(`/playlists/${playlistId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await request<void>(`/playlists/${playlistId}`, {
    method: "DELETE",
  });
}

export async function rescanLibrary(): Promise<LibraryRescanResponse> {
  return request<LibraryRescanResponse>("/library/rescan", {
    method: "POST",
  });
}
