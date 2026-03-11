export type HealthResponse = {
  status: string;
  app: string;
  environment: string;
};

export type Playlist = {
  id: string;
  source_url: string;
  playlist_id: string | null;
  title: string;
  folder_name: string;
  folder_path: string;
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

export type CreatePlaylistInput = {
  source_url: string;
  title: string;
  folder_name: string;
  folder_path: string;
  cookies_browser: string | null;
  resolution_limit: number | null;
  active: boolean;
  playlist_id?: string | null;
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
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

fetchHealth.endpoint = `${API_BASE_URL}/health`;

export async function fetchPlaylists(): Promise<PlaylistListResponse> {
  return request<PlaylistListResponse>("/playlists");
}

export async function createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
  return request<Playlist>("/playlists", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
