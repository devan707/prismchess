import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

let cached: { isAdmin: boolean; isModerator: boolean } | null = null;

/** Cheap, cached client-side role check. Re-fetches once per page load.
 *  Skips the fetch entirely for signed-out users so public routes don't
 *  trigger the auth-required server function (which 401s with no session). */
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
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) {
        cached = { isAdmin: false, isModerator: false };
        setState({ isAdmin: false, isModerator: false, isModOrAdmin: false });
        return;
      }
      try {
        const r = await fetchRole({});
        if (!alive) return;
        cached = { isAdmin: r.isAdmin, isModerator: r.isModerator };
        setState({ isAdmin: r.isAdmin, isModerator: r.isModerator, isModOrAdmin: r.isAdmin || r.isModerator });
      } catch {
        // ignore — leave defaults
      }
    })();
    return () => { alive = false; };
  }, [fetchRole]);
  return state;
}
