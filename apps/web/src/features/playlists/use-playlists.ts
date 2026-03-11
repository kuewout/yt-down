import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPlaylist,
  deletePlaylist,
  downloadNewVideos,
  fetchPlaylistVideos,
  fetchPlaylists,
  rescanLibrary,
  syncPlaylist,
  type CreatePlaylistInput,
  type UpdatePlaylistInput,
  updatePlaylist,
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

export function useUpdatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playlistId, input }: { playlistId: string; input: UpdatePlaylistInput }) =>
      updatePlaylist(playlistId, input),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["playlists"] }),
        queryClient.invalidateQueries({ queryKey: ["playlist-videos", variables.playlistId] }),
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
      ]);
    },
  });
}
