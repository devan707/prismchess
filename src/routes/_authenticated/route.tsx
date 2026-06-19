import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AnnouncementGate } from "@/components/announcements/AnnouncementGate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Gate the rest of the app behind onboarding completion.
    if (location.pathname !== "/onboarding") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile && profile.onboarded === false) {
        throw redirect({ to: "/onboarding" });
      }
    }
    return { user: data.user };
  },
  component: () => (
    <>
      <Outlet />
      <AnnouncementGate />
    </>
  ),
});
