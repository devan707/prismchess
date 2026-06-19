import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Home, Trash2, Swords, Bot, History as HistoryIcon } from "lucide-react";
import { listGameHistory, deleteSoloGame, type HistoryEntry } from "@/lib/history.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Game History — Prism Chess" },
      { name: "description", content: "Review your past Prism Chess games against the AI or other players." },
    ],
  }),
  component: HistoryPage,
});

type Filter = "all" | "multiplayer" | "solo";

function HistoryPage() {
  const fetchHistory = useServerFn(listGameHistory);
  const deleteSolo = useServerFn(deleteSoloGame);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetchHistory()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load history"));
  };
  useEffect(load, [fetchHistory]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (filter === "all") return entries;
    return entries.filter((e) => e.source === filter);
  }, [entries, filter]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSolo({ data: { id } });
      setEntries((prev) => prev?.filter((e) => !(e.source === "solo" && e.id === id)) ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-3 py-2 flex items-center justify-between gap-2 border-b">
        <Link to="/">
          <Button variant="ghost" size="icon" aria-label="Home"><Home className="h-4 w-4" /></Button>
        </Link>
        <div className="flex items-center gap-2 font-display font-semibold">
          <HistoryIcon className="h-4 w-4" /> Game history
        </div>
        <div className="w-9" />
      </header>

      <main className="max-w-3xl mx-auto px-3 py-4 space-y-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="multiplayer">
              <Swords className="h-3 w-3 mr-1" /> Multiplayer
            </TabsTrigger>
            <TabsTrigger value="solo">
              <Bot className="h-3 w-3 mr-1" /> vs Computer
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {error && (
          <div className="rounded-lg border bg-card p-4 text-sm text-destructive">{error}</div>
        )}
        {!entries && !error && (
          <div className="text-center text-sm text-muted-foreground py-12">Loading history…</div>
        )}
        {entries && filtered.length === 0 && (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            No games yet. Play one and it'll show up here.
          </div>
        )}

        <ul className="space-y-2">
          {filtered.map((e) => (
            <li key={`${e.source}:${e.id}`}>
              <HistoryRow entry={e} onDelete={e.source === "solo" ? () => handleDelete(e.id) : undefined} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function outcomeStyles(o: HistoryEntry["outcome"]): { label: string; variant: "default" | "destructive" | "secondary" | "outline" } {
  switch (o) {
    case "win": return { label: "Win", variant: "default" };
    case "loss": return { label: "Loss", variant: "destructive" };
    case "draw": return { label: "Draw", variant: "secondary" };
    case "unfinished": return { label: "In progress", variant: "outline" };
  }
}

const REASON_LABEL: Record<string, string> = {
  checkmate: "checkmate",
  resign: "resignation",
  timeout: "time",
  draw_agreed: "agreement",
  stalemate: "stalemate",
  royal_loss: "royal captured",
  aborted: "aborted",
};

function HistoryRow({ entry, onDelete }: { entry: HistoryEntry; onDelete?: () => void }) {
  const { label, variant } = outcomeStyles(entry.outcome);
  const when = new Date(entry.endedAt).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  const reason = entry.resultReason ? REASON_LABEL[entry.resultReason] ?? entry.resultReason : null;

  const subtitle =
    entry.source === "multiplayer"
      ? `vs ${entry.opponentName ?? "Opponent"} · ${entry.timeControl ?? ""}${reason && entry.outcome !== "unfinished" ? ` · by ${reason}` : ""}`
      : `vs Computer · ${entry.difficulty ?? ""}${reason ? ` · by ${reason}` : ""}`;

  const inner = (
    <div className="w-full rounded-lg border bg-card px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-accent/40 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {entry.source === "multiplayer"
            ? <Swords className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="font-display font-semibold truncate">{entry.designName}</span>
          <Badge variant={variant} className="ml-auto shrink-0">{label}</Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</div>
        <div className="text-[10px] text-muted-foreground/80 mt-0.5">{when}</div>
      </div>
    </div>
  );

  return (
    <div className="flex items-stretch gap-2">
      {entry.source === "multiplayer" ? (
        <Link to="/multiplayer/$matchId" params={{ matchId: entry.id }} className="flex-1 min-w-0">
          {inner}
        </Link>
      ) : (
        <Link to="/history/$id" params={{ id: entry.id }} className="flex-1 min-w-0">
          {inner}
        </Link>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete"
          className="shrink-0 self-center"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
