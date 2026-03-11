import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createPlaylist, fetchPlaylists, type CreatePlaylistInput } from "../../api/client";

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
