import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/profile.functions";

let cached: { isAdmin: boolean; isModerator: boolean } | null = null;

/** Cheap, cached client-side role check. Re-fetches once per page load. */
export function useIsAdmin() {
  const fetchRole = useServerFn(getMyRole);
  const [state, setState] = useState<{ isAdmin: boolean; isModerator: boolean; isModOrAdmin: boolean }>(
    () => ({
      isAdmin: cached?.isAdmin ?? false,
      isModerator: cached?.isModerator ?? false,
      isModOrAdmin: (cached?.isAdmin ?? false) || (cached?.isModerator ?? false),
    }),
  );
  useEffect(() => {
    let alive = true;
    fetchRole({})
      .then((r) => {
        if (!alive) return;
        cached = { isAdmin: r.isAdmin, isModerator: r.isModerator };
        setState({ isAdmin: r.isAdmin, isModerator: r.isModerator, isModOrAdmin: r.isAdmin || r.isModerator });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [fetchRole]);
  return state;
}
