import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPlaylist,
  downloadNewVideos,
  fetchPlaylistVideos,
  fetchPlaylists,
  syncPlaylist,
  type CreatePlaylistInput,
} from "../../api/client";

export function usePlaylists() {
  return useQuery({
    queryKey: ["playlists"],
    queryFn: fetchPlaylists,
  });
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

export function useDownloadNewVideos() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playlistId: string) => downloadNewVideos(playlistId),
    onSuccess: async (_, playlistId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["playlist-videos", playlistId] }),
      ]);
    },
  });
}
