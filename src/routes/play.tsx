import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Board } from "@/components/chess/Board";
import { useGame } from "@/hooks/useGame";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { Captured, MoveHistory } from "@/components/chess/MoveHistory";
import { ReservesPanel } from "@/components/designer/ReservesPanel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadDesign } from "@/game/design";
import type { Color, Design, Difficulty } from "@/game/types";
import { sfx } from "@/lib/sfx";
import { ArrowLeft, RotateCcw, RefreshCw, FlipVertical2, Volume2, VolumeX } from "lucide-react";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Play — Design Your Own Chess" },
      { name: "description", content: "Play your custom chess design against an AI opponent." },
    ],
  }),
  component: PlayRoute,
});

function PlayRoute() {
  const navigate = useNavigate();
  const [design, setDesign] = useState<Design | null>(null);

  useEffect(() => {
    const d = loadDesign();
    if (!d) { navigate({ to: "/" }); return; }
    setDesign(d);
  }, [navigate]);

  if (!design) return null;
  return <Play design={design} />;
}

function StatusBadge({ kind }: { kind: string }) {
  const cls =
    kind === "Checkmate" || kind === "Victory" ? "bg-destructive text-destructive-foreground" :
    kind === "Check" ? "bg-accent text-accent-foreground" :
    kind === "Stalemate" ? "bg-muted text-muted-foreground" :
    "bg-primary text-primary-foreground";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{kind}</span>;
}

function Play({ design }: { design: Design }) {
  const [humanColor, setHumanColor] = useState<Color>("w");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [flipped, setFlipped] = useState(false);
  const [muted, setMuted] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const designMemo = useMemo(() => design, [design]);

  return (
    <GameView
      key={resetKey}
      humanColor={humanColor}
      difficulty={difficulty}
      design={designMemo}
      flipped={flipped}
      muted={muted}
      setHumanColor={(c) => { setHumanColor(c); setResetKey((k) => k + 1); }}
      setDifficulty={setDifficulty}
      setFlipped={setFlipped}
      setMuted={(m) => { sfx.setMuted(m); setMuted(m); }}
      onNewGame={() => setResetKey((k) => k + 1)}
    />
  );
}

interface GVProps {
  humanColor: Color;
  difficulty: Difficulty;
  design: Design;
  flipped: boolean;
  muted: boolean;
  setHumanColor: (c: Color) => void;
  setDifficulty: (d: Difficulty) => void;
  setFlipped: (f: boolean) => void;
  setMuted: (m: boolean) => void;
  onNewGame: () => void;
}

function GameView({ humanColor, difficulty, design, flipped, muted, setHumanColor, setDifficulty, setFlipped, setMuted, onNewGame }: GVProps) {
  const game = useGame({ humanColor, difficulty, design });
  const {
    state, status, tryMove, tryDrop, legalFor, legalDropSquares,
    selectedDrop, setSelectedDrop,
    undo, pendingPromotion, promotionOptions, confirmPromotion,
  } = game;

  const check = status.kind === "playing" ? status.check : false;
  const winner = status.kind === "checkmate" || status.kind === "royal-loss" ? status.winner : null;

  const statusLabel =
    status.kind === "checkmate"
      ? `Checkmate — ${winner === "w" ? "White" : "Black"} wins`
      : status.kind === "royal-loss"
        ? `Royal captured — ${winner === "w" ? "White" : "Black"} wins`
        : status.kind === "stalemate"
          ? "Stalemate"
          : check
            ? `${state.turn === "w" ? "White" : "Black"} in check`
            : `${state.turn === "w" ? "White" : "Black"} to move`;

  const badgeKind =
    status.kind === "checkmate" || status.kind === "royal-loss" ? "Victory" :
    status.kind === "stalemate" ? "Stalemate" :
    check ? "Check" : "Playing";

  const dropTargets = selectedDrop ? legalDropSquares(selectedDrop) : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-6xl mx-auto px-4 pt-6 pb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Designer
            </Button>
          </Link>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            {design.rows}×{design.cols} <span className="text-primary">Custom</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setMuted(!muted)} aria-label="Toggle sound">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFlipped(!flipped)}>
            <FlipVertical2 className="h-4 w-4 mr-1" /> Flip
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pb-12 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[640px] flex items-center justify-between">
            <StatusBadge kind={badgeKind} />
            <span className="font-display text-lg">{statusLabel}</span>
          </div>
          <ReservesPanel
            state={state}
            color={state.turn === humanColor ? humanColor : (humanColor === "w" ? "b" : "w")}
            selectedDrop={selectedDrop}
            onSelectDrop={setSelectedDrop}
            disabled={state.turn !== humanColor || status.kind !== "playing"}
          />
          <Board
            state={state}
            humanColor={humanColor}
            flipped={flipped}
            legalFor={legalFor}
            onMove={(f, t) => tryMove(f, t)}
            dropPiece={selectedDrop}
            dropTargets={dropTargets}
            onDrop={(id, to) => tryDrop(id, to)}
            disabled={status.kind !== "playing"}
          />
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg border bg-card p-3 space-y-3">
            <h2 className="font-display text-base font-semibold">Game</h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Play as</label>
                <Select value={humanColor} onValueChange={(v) => setHumanColor(v as Color)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="w">White</SelectItem>
                    <SelectItem value="b">Black</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Difficulty</label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={onNewGame} size="sm" className="flex-1">
                <RefreshCw className="h-4 w-4 mr-1" /> New game
              </Button>
              <Button onClick={undo} size="sm" variant="outline" className="flex-1" disabled={state.history.length === 0}>
                <RotateCcw className="h-4 w-4 mr-1" /> Undo
              </Button>
            </div>
          </div>

          <Captured state={state} />
          <MoveHistory state={state} />
        </aside>
      </main>

      <PromotionDialog
        open={!!pendingPromotion}
        color={humanColor}
        options={promotionOptions}
        registry={state.registry}
        onChoose={(p) => confirmPromotion(p)}
      />
    </div>
  );
}
