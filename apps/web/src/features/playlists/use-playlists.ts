import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ACTIVITY_STREAM_URL,
  createPlaylist,
  deletePlaylist,
  downloadVideo,
  downloadNewVideos,
  fetchCookieBrowsers,
  fetchPlaylistVideos,
  fetchPlaylists,
  fetchVideos,
  openPlaylistFolder,
  pickPlaylistFolder,
  rescanLibrary,
  syncPlaylist,
  type ActivityResponse,
  type CreatePlaylistInput,
  type UpdatePlaylistInput,
  updatePlaylist,
} from "../../api/client";

const ACTIVITY_HISTORY_STORAGE_KEY = "yt-down:activity-history:v1";
const ACTIVITY_HISTORY_LIMIT = 100;

function buildActivityEventKey(activity: ActivityResponse): string {
  return [
    activity.updated_at ?? activity.finished_at ?? activity.started_at ?? "unknown",
    activity.operation ?? "none",
    activity.playlist_id ?? "none",
    activity.video_id ?? "none",
    activity.items_completed,
    activity.message ?? "",
  ].join(":");
}

function loadPersistedActivityEvents(): ActivityResponse[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(ACTIVITY_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is ActivityResponse => {
      return typeof item === "object" && item !== null && "operation" in item;
    }).slice(0, ACTIVITY_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function usePlaylists() {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: fetchPlaylists,
  });
}

export function useCookieBrowsers() {
  return useQuery({
    queryKey: ["cookie-browsers"],
    queryFn: fetchCookieBrowsers,
    staleTime: 60_000,
  });
}

export function useActivity() {
  const initialEvents = loadPersistedActivityEvents();
  const [events, setEvents] = useState<ActivityResponse[]>(initialEvents);
  const [data, setData] = useState<ActivityResponse | undefined>(initialEvents[0]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(events.length === 0);

  useEffect(() => {
    let closed = false;
    const eventSource = new EventSource(ACTIVITY_STREAM_URL);

    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as ActivityResponse;
        if (closed) {
          return;
        }
        setData(payload);
        setEvents((current) => {
          if (current.length && buildActivityEventKey(current[0]) === buildActivityEventKey(payload)) {
            return current;
          }
          return [payload, ...current].slice(0, ACTIVITY_HISTORY_LIMIT);
        });
        setError(null);
        setIsLoading(false);
      } catch (parseError) {
        if (closed) {
          return;
        }
        setError(parseError instanceof Error ? parseError : new Error("Invalid activity payload"));
        setIsLoading(false);
      }
    };

    eventSource.addEventListener("activity", handleMessage);
    eventSource.onerror = () => {
      if (closed || eventSource.readyState !== EventSource.CLOSED) {
        return;
      }
      setError(new Error("Activity stream disconnected"));
      setIsLoading(false);
    };

    return () => {
      closed = true;
      eventSource.removeEventListener("activity", handleMessage);
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(ACTIVITY_HISTORY_STORAGE_KEY, JSON.stringify(events.slice(0, ACTIVITY_HISTORY_LIMIT)));
    } catch {
      // Ignore storage errors to avoid breaking live activity updates.
    }
  }, [events]);

  return {
    data,
    events,
    error,
    isError: Boolean(error),
    isLoading,
  };
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePlaylistInput) => createPlaylist(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
  });
}

export function useSyncPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playlistId: string) => syncPlaylist(playlistId),
    onSuccess: async (_, playlistId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["playlist-videos", playlistId] }),
        queryClient.invalidateQueries({ queryKey: ["videos"] }),
      ]);
    },
  });
}

export function usePlaylistVideos(playlistId: string | null) {
  return useQuery({
    queryKey: ["playlist-videos", playlistId],
    queryFn: () => fetchPlaylistVideos(playlistId!),
    enabled: Boolean(playlistId),
  });
}

export function useVideos() {
  return useQuery({
    queryKey: ["videos"],
    queryFn: fetchVideos,
  });
}

export function useDownloadNewVideos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      playlistId,
      batchSize,
      cookiesBrowser,
    }: {
      playlistId: string;
      batchSize: number;
      cookiesBrowser: string | null;
    }) => downloadNewVideos(playlistId, batchSize, cookiesBrowser),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["playlist-videos", variables.playlistId] }),
        queryClient.invalidateQueries({ queryKey: ["videos"] }),
      ]);
    },
  });
}

export function useDownloadVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      playlistId,
      videoId,
      cookiesBrowser,
    }: {
      playlistId: string;
      videoId: string;
      cookiesBrowser: string | null;
    }) => downloadVideo(playlistId, videoId, cookiesBrowser),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["playlist-videos", variables.playlistId] }),
        queryClient.invalidateQueries({ queryKey: ["videos"] }),
      ]);
    },
  });
}

export function useUpdatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playlistId, input }: { playlistId: string; input: UpdatePlaylistInput }) =>
      updatePlaylist(playlistId, input),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["playlist-videos", variables.playlistId] }),
        queryClient.invalidateQueries({ queryKey: ["videos"] }),
      ]);
    },
  });
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playlistId: string) => deletePlaylist(playlistId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["playlist-videos"] }),
        queryClient.invalidateQueries({ queryKey: ["videos"] }),
      ]);
    },
  });
}

export function useRescanLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => rescanLibrary(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["playlist-videos"] }),
        queryClient.invalidateQueries({ queryKey: ["videos"] }),
      ]);
    },
  });
}

export function useOpenPlaylistFolder() {
  return useMutation({
    mutationFn: (playlistId: string) => openPlaylistFolder(playlistId),
  });
}

export function usePickPlaylistFolder() {
  return useMutation({
    mutationFn: (playlistId: string) => pickPlaylistFolder(playlistId),
  });
}
