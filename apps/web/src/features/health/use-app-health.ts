import { useQuery } from "@tanstack/react-query";

import { fetchHealth } from "../../api/client";

export function useAppHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
  });
}
