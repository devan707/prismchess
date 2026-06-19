import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { getChallengePreview, joinMatch } from "@/lib/multiplayer.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/multiplayer/join/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Join challenge — Prism Chess" },
      { name: "description", content: "You've been invited to a multiplayer chess challenge." },
    ],
  }),
  component: JoinPage,
});

const PENDING_KEY = "pendingJoinToken";

function formatTc(tc: string): string {
  if (tc === "3day") return "3 days/move";
  const m = /^(\d+)min$/.exec(tc);
  return m ? `${m[1]} minute${m[1] === "1" ? "" : "s"}` : tc;
}

function JoinPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetchPreview = useServerFn(getChallengePreview);
  const join = useServerFn(joinMatch);

  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getChallengePreview>> | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPreview({ data: { token } })
      .then((p) => {
        if (!p.match) setError("Challenge not found or no longer active.");
        setPreview(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load challenge"));
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      setMeId(data.user?.id ?? null);
      setAuthChecked(true);
    });
  }, [fetchPreview, token]);

  const accept = async () => {
    setBusy(true);
    try {
      const res = await join({ data: { token } });
      sessionStorage.removeItem(PENDING_KEY);
      navigate({ to: "/multiplayer/$matchId", params: { matchId: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't join");
      setBusy(false);
    }
  };

  const signInToAccept = () => {
    try { sessionStorage.setItem(PENDING_KEY, token); } catch {}
    const here = `/multiplayer/join/${encodeURIComponent(token)}`;
    navigate({ to: "/auth", search: { redirect: here } });
  };

  // Auto-accept on return from sign-up / sign-in if this token matches what we stored.
  useEffect(() => {
    if (!authChecked || !signedIn || !preview?.match) return;
    if (preview.match.status !== "open") return;
    if (meId && preview.match.id && false) return; // (guarded below)
    let pending: string | null = null;
    try { pending = sessionStorage.getItem(PENDING_KEY); } catch {}
    if (pending === token) {
      accept();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, signedIn, preview, token]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link to="/"><Button size="sm" variant="outline"><Home className="h-4 w-4 mr-1" /> Home</Button></Link>
        </div>
      </div>
    );
  }
  if (!preview || !preview.match || !authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading challenge…</div>;
  }

  const m = preview.match;
  const hostName = preview.host?.display_name ?? preview.host?.username ?? "Someone";
  const youPlay = m.host_color === "w" ? "Black" : "White";
  const isMyOwn = signedIn && meId && false; // we can't tell host_id without auth; rely on accept errors
  void isMyOwn;

  const stillOpen = m.status === "open";
  const alreadyTaken = m.status !== "open";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center space-y-4">
        <Link to="/" className="inline-flex text-muted-foreground hover:text-foreground"><Home className="h-4 w-4" /></Link>
        <h1 className="font-display text-xl font-bold">You're invited</h1>
        <p className="text-sm">
          <span className="font-semibold">{hostName}</span> wants to play you at{" "}
          <span className="font-semibold">{m.design_name}</span>.
        </p>
        <p className="text-xs text-muted-foreground">
          {formatTc(m.time_control)} · You'll play {youPlay}.
        </p>

        {alreadyTaken ? (
          <>
            <p className="text-sm text-muted-foreground">This challenge has already been accepted.</p>
            <Link to="/multiplayer"><Button size="sm" variant="outline">Browse the lobby</Button></Link>
          </>
        ) : signedIn ? (
          <Button onClick={accept} disabled={busy || !stillOpen} className="w-full">
            {busy ? "Joining…" : "Accept challenge"}
          </Button>
        ) : (
          <>
            <Button onClick={signInToAccept} disabled={busy} className="w-full">
              Sign up & accept
            </Button>
            <p className="text-xs text-muted-foreground">
              You'll need a quick account so we can save the game. Already have one? You can sign in.
            </p>
          </>
        )}
        <Link to="/multiplayer" className="block text-xs text-muted-foreground underline">
          Or browse the lobby
        </Link>
      </div>
    </div>
  );
}
