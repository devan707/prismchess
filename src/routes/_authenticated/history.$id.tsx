import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Home } from "lucide-react";
import { Board } from "@/components/chess/Board";
import { MoveHistory } from "@/components/chess/MoveHistory";
import { getSoloGame, type SoloGameDetail } from "@/lib/history.functions";
import { initialStateFromDesign, replayMoves } from "@/game/rules";
import { fmtMove } from "@/lib/api/analyze-game.functions";
import type { MoveTarget, Square } from "@/game/types";

export const Route = createFileRoute("/_authenticated/history/$id")({
  head: () => ({
    meta: [{ title: "Game replay — Prism Chess" }],
  }),
  component: HistoryDetail,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-destructive">{error?.message ?? "Failed to load game"}</p>
        <Button onClick={() => { reset(); router.invalidate(); }} size="sm">Retry</Button>
        <Link to="/history"><Button variant="ghost" size="sm">Back to history</Button></Link>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">Game not found.</p>
      <Link to="/history"><Button variant="ghost" size="sm">Back to history</Button></Link>
    </div>
  ),
});

function HistoryDetail() {
  const { id } = Route.useParams();
  const fetchGame = useServerFn(getSoloGame);
  const [game, setGame] = useState<SoloGameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState(0);

  useEffect(() => {
    setError(null);
    fetchGame({ data: { id } })
      .then((g) => { setGame(g); setViewIndex(g.moves.length); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load game"));
  }, [fetchGame, id]);

  const startState = useMemo(() => (game ? initialStateFromDesign(game.design) : null), [game]);
  const displayed = useMemo(() => {
    if (!game || !startState) return null;
    return replayMoves(game.moves.slice(0, viewIndex), startState);
  }, [game, startState, viewIndex]);

  const moveLabels = useMemo(() => {
    if (!game || !startState) return [] as string[];
    // Replay incrementally so each label sees the state-before-move.
    const labels: string[] = [];
    let s = startState;
    game.moves.forEach((m, i) => {
      labels.push(fmtMove(m, s.cols, i + 1, s.registry));
      s = replayMoves([m], s);
    });
    return labels;
  }, [game, startState]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link to="/history"><Button variant="ghost" size="sm">Back to history</Button></Link>
      </div>
    );
  }
  if (!game || !displayed) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading game…</div>;
  }

  const total = game.moves.length;
  const currentLabel = viewIndex > 0 ? moveLabels[viewIndex - 1] : null;
  const noLegal = (_sq: Square | null): MoveTarget[] => [];
  const noopMove = (_f: Square, _t: Square) => false;
  const outcome: "win" | "loss" | "draw" =
    game.result === "draw" ? "draw" : game.result === game.humanColor ? "win" : "loss";
  const outcomeLabel = outcome === "win" ? "Win" : outcome === "loss" ? "Loss" : "Draw";
  const outcomeVariant = outcome === "win" ? "default" : outcome === "loss" ? "destructive" : "secondary";
  const when = new Date(game.endedAt).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-3 py-2 flex items-center justify-between gap-2 border-b">
        <Link to="/history">
          <Button variant="ghost" size="icon" aria-label="Back"><ChevronLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex items-center gap-2 font-display font-semibold truncate">
          <span className="truncate">{game.designName}</span>
          <Badge variant={outcomeVariant as "default" | "destructive" | "secondary"}>{outcomeLabel}</Badge>
        </div>
        <Link to="/">
          <Button variant="ghost" size="icon" aria-label="Home"><Home className="h-4 w-4" /></Button>
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-3 py-4 space-y-3">
        <div className="text-xs text-muted-foreground">
          vs Computer · {game.difficulty} · by {game.resultReason} · {when}
        </div>

        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground text-center">
            {viewIndex === 0
              ? "Starting position"
              : `Move ${viewIndex} of ${total}${currentLabel ? ` — ${currentLabel}` : ""}`}
          </div>
          <div className="mx-auto w-full max-w-[360px]">
            <Board
              state={displayed}
              humanColor={game.humanColor}
              flipped={false}
              legalFor={noLegal}
              onMove={noopMove}
              disabled
            />
          </div>
          <div className="flex items-center justify-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Start"
              onClick={() => setViewIndex(0)} disabled={viewIndex === 0}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Previous"
              onClick={() => setViewIndex((i) => Math.max(0, i - 1))} disabled={viewIndex === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums text-xs min-w-[5rem] text-center">{viewIndex} / {total}</span>
            <Button variant="ghost" size="icon" aria-label="Next"
              onClick={() => setViewIndex((i) => Math.min(total, i + 1))} disabled={viewIndex >= total}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="End"
              onClick={() => setViewIndex(total)} disabled={viewIndex >= total}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <MoveHistory state={displayed} />
      </main>
    </div>
  );
}
