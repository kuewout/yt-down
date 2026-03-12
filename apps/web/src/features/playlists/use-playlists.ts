import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPlaylist,
  deletePlaylist,
  downloadNewVideos,
  fetchActivity,
  fetchPlaylistVideos,
  fetchPlaylists,
  fetchVideos,
  openPlaylistFolder,
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

export function useActivity() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: fetchActivity,
    refetchInterval: 3000,
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
