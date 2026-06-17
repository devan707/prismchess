import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { getMatchByToken, joinMatch } from "@/lib/multiplayer.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/multiplayer/join/$token")({
  head: () => ({ meta: [{ title: "Join challenge — Prism Chess" }] }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetchByToken = useServerFn(getMatchByToken);
  const join = useServerFn(joinMatch);
  const [data, setData] = useState<Awaited<ReturnType<typeof getMatchByToken>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchByToken({ data: { token } })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load challenge"));
  }, [fetchByToken, token]);

  const accept = async () => {
    setBusy(true);
    try {
      const res = await join({ data: { token } });
      navigate({ to: "/multiplayer/$matchId", params: { matchId: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't join");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center space-y-4">
        <Link to="/" className="inline-flex"><Home className="h-4 w-4 mr-1" /></Link>
        <h1 className="font-display text-xl font-bold">Join a challenge</h1>
        {error ? (
          <>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link to="/multiplayer"><Button size="sm" variant="outline">Go to lobby</Button></Link>
          </>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data.meId === data.match.host_id ? (
          <>
            <p className="text-sm text-muted-foreground">This is your own challenge. Share the link with a friend, or open the lobby to wait for them.</p>
            <Link to="/multiplayer/$matchId" params={{ matchId: data.match.id }}><Button size="sm">Open match</Button></Link>
          </>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-semibold">{data.host?.display_name ?? data.host?.username ?? "Someone"}</span>
              {" "}invited you to play <span className="font-semibold">{data.match.design_name}</span>.
            </p>
            <p className="text-xs text-muted-foreground">
              Time control: {data.match.time_control === "3day" ? "3 days/move" : data.match.time_control === "30min" ? "30 minutes" : "10 minutes"}
              {" · "}
              You'll play {data.match.host_color === "w" ? "Black" : "White"}.
            </p>
            <Button onClick={accept} disabled={busy} className="w-full">
              {busy ? "Joining…" : "Accept challenge"}
            </Button>
            <Link to="/multiplayer" className="block text-xs text-muted-foreground underline">Or browse the lobby</Link>
          </>
        )}
      </div>
    </div>
  );
}
