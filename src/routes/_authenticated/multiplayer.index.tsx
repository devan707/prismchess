import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  createChallenge,
  listOpenChallenges,
  listMyMatches,
  joinMatch,
  cancelChallenge,
} from "@/lib/multiplayer.functions";
import { BUILTIN_GAMES } from "@/game/library";
import { loadSavedGames, type SavedGame } from "@/game/library";
import { Home, Swords, Users, Plus, Copy, Trash2, Clock, Hourglass, Zap } from "lucide-react";
import { toast } from "sonner";
import type { Color, Design } from "@/game/types";

export const Route = createFileRoute("/_authenticated/multiplayer/")({
  head: () => ({ meta: [{ title: "Multiplayer lobby — Prism Chess" }] }),
  component: LobbyPage,
});

type OpenChallenge = Awaited<ReturnType<typeof listOpenChallenges>>[number];
type MyMatch = Awaited<ReturnType<typeof listMyMatches>>[number];

function TimeControlLabel({ tc }: { tc: string }) {
  if (tc === "3day") return <span className="inline-flex items-center gap-1"><Hourglass className="h-3 w-3" /> 3 days/move</span>;
  const m = /^(\d+)min$/.exec(tc);
  if (m) {
    const n = parseInt(m[1], 10);
    const Icon = n <= 3 ? Zap : Clock;
    const label = n <= 3 ? `Blitz ${n} min` : `${n} min`;
    return <span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</span>;
  }
  return <span>{tc}</span>;
}

function LobbyPage() {
  const navigate = useNavigate();
  const fetchOpen = useServerFn(listOpenChallenges);
  const fetchMine = useServerFn(listMyMatches);
  const accept = useServerFn(joinMatch);
  const cancel = useServerFn(cancelChallenge);

  const [open, setOpen] = useState<OpenChallenge[]>([]);
  const [mine, setMine] = useState<MyMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const [o, m] = await Promise.all([fetchOpen({}), fetchMine({})]);
      setOpen(o);
      setMine(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load lobby");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAccept = async (id: string) => {
    try {
      await accept({ data: { matchId: id } });
      navigate({ to: "/multiplayer/$matchId", params: { matchId: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not join");
      refresh();
    }
  };

  const onCancel = async (id: string) => {
    try {
      await cancel({ data: { matchId: id } });
      toast.success("Challenge cancelled");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const activeMine = mine.filter((m) => m.status === "active" || m.status === "open");
  const finishedMine = mine.filter((m) => m.status === "finished" || m.status === "aborted");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-3 py-2 border-b flex items-center justify-between">
        <Link to="/">
          <Button variant="ghost" size="icon" aria-label="Home"><Home className="h-4 w-4" /></Button>
        </Link>
        <h1 className="font-display font-semibold text-base flex items-center gap-2">
          <Swords className="h-4 w-4" /> Multiplayer
        </h1>
        <CreateChallengeButton onCreated={refresh} />
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" /> Open challenges
            </h2>
            <Button variant="ghost" size="sm" onClick={refresh}>Refresh</Button>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : open.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card/40 p-6 text-center text-sm text-muted-foreground">
              No open challenges. Create one to get the lobby going.
            </div>
          ) : (
            <ul className="space-y-2">
              {open.map((c) => (
                <li key={c.id} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-semibold truncate">{c.design_name}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                      <span>by {c.host?.display_name ?? c.host?.username ?? "Anonymous"}</span>
                      <TimeControlLabel tc={c.time_control} />
                      <span>Host plays {c.host_color === "w" ? "White" : "Black"}</span>
                    </div>
                  </div>
                  {c.is_mine ? (
                    <Button size="sm" variant="ghost" onClick={() => onCancel(c.id)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onAccept(c.id)}>Accept</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold mb-3">Your games</h2>
          {activeMine.length === 0 && finishedMine.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card/40 p-6 text-center text-sm text-muted-foreground">
              You haven't played any multiplayer games yet.
            </div>
          ) : (
            <div className="space-y-4">
              {activeMine.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">In progress</div>
                  {activeMine.map((m) => <MyMatchRow key={m.id} m={m} />)}
                </div>
              )}
              {finishedMine.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Finished</div>
                  {finishedMine.slice(0, 10).map((m) => <MyMatchRow key={m.id} m={m} />)}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function MyMatchRow({ m }: { m: MyMatch }) {
  const opponent = m.i_am === "host" ? m.guest : m.host;
  const myColor = m.i_am === "host" ? m.host_color : (m.host_color === "w" ? "b" : "w");
  const resultLabel =
    m.status === "finished"
      ? m.result === "draw"
        ? "Draw"
        : m.result === myColor
          ? "You won"
          : "You lost"
      : m.status === "open"
        ? "Waiting for opponent"
        : (m.turn === myColor ? "Your move" : "Their move");
  return (
    <Link
      to="/multiplayer/$matchId"
      params={{ matchId: m.id }}
      className="block rounded-lg border bg-card p-3 hover:border-primary transition"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-semibold truncate">{m.design_name}</div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
            <span>vs {opponent?.display_name ?? opponent?.username ?? "—"}</span>
            <TimeControlLabel tc={m.time_control} />
            <span>You: {myColor === "w" ? "White" : "Black"}</span>
          </div>
        </div>
        <div className="text-xs text-right shrink-0">{resultLabel}</div>
      </div>
    </Link>
  );
}

function CreateChallengeButton({ onCreated }: { onCreated: () => void }) {
  const create = useServerFn(createChallenge);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("builtin:classic-8");
  const [timeControl, setTimeControl] = useState<"2min" | "10min" | "30min" | "3day" | "custom">("10min");
  const [customMinutes, setCustomMinutes] = useState<number>(5);
  const [hostColor, setHostColor] = useState<Color>("w");
  const [visibility, setVisibility] = useState<"public" | "link">("public");
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => { if (open) setSaved(loadSavedGames()); }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      let design: Design;
      let name: string;
      if (selectedKey.startsWith("builtin:")) {
        const id = selectedKey.slice("builtin:".length);
        const g = BUILTIN_GAMES.find((x) => x.id === id) ?? BUILTIN_GAMES[0];
        design = g.build();
        name = g.name;
      } else {
        const id = selectedKey.slice("saved:".length);
        const s = saved.find((x) => x.id === id);
        if (!s) throw new Error("Saved design not found");
        design = s.design;
        name = s.name;
      }
      const resolvedTc =
        timeControl === "custom"
          ? `${Math.max(1, Math.min(180, Math.floor(customMinutes || 1)))}min`
          : timeControl;
      const res = await create({
        data: {
          design: design as unknown as Record<string, unknown>,
          designName: name,
          timeControl: resolvedTc,
          hostColor,
          visibility,
        },
      });
      if (visibility === "link") {
        const url = `${window.location.origin}/multiplayer/join/${encodeURIComponent(res.shareToken)}`;
        setShareUrl(url);
        onCreated();
      } else {
        toast.success("Challenge posted to lobby");
        setOpen(false);
        onCreated();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create challenge");
    } finally {
      setBusy(false);
    }
  };

  const copyShare = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy"),
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShareUrl(null); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New challenge</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a multiplayer challenge</DialogTitle>
          <DialogDescription>Pick a design and a time control. Post it to the public lobby or share a private link.</DialogDescription>
        </DialogHeader>
        {shareUrl ? (
          <div className="space-y-3">
            <p className="text-sm">Share this link with your opponent:</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
              />
              <Button size="sm" onClick={copyShare}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Design</Label>
              <Select value={selectedKey} onValueChange={setSelectedKey}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Built-in</div>
                  {BUILTIN_GAMES.map((g) => (
                    <SelectItem key={g.id} value={`builtin:${g.id}`}>{g.name}</SelectItem>
                  ))}
                  {saved.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-t mt-1">Your saved games</div>
                      {saved.map((s) => (
                        <SelectItem key={s.id} value={`saved:${s.id}`}>{s.name}</SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Time control</Label>
                <Select value={timeControl} onValueChange={(v) => setTimeControl(v as typeof timeControl)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2min">Blitz · 2 min</SelectItem>
                    <SelectItem value="10min">10 min</SelectItem>
                    <SelectItem value="30min">30 min</SelectItem>
                    <SelectItem value="3day">3 days / move</SelectItem>
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {timeControl === "custom" && (
                  <div className="mt-2">
                    <Label className="text-xs text-muted-foreground">Minutes per player</Label>
                    <input
                      type="number"
                      min={1}
                      max={180}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(Number(e.target.value))}
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </div>
                )}
              </div>
              <div>
                <Label>Play as</Label>
                <Select value={hostColor} onValueChange={(v) => setHostColor(v as Color)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="w">White</SelectItem>
                    <SelectItem value="b">Black</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as "public" | "link")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public lobby</SelectItem>
                    <SelectItem value="link">Link only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
