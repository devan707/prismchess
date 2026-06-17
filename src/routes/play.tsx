import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Board } from "@/components/chess/Board";
import { useGame } from "@/hooks/useGame";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { Captured, MoveHistory } from "@/components/chess/MoveHistory";
import { ReservesPanel } from "@/components/designer/ReservesPanel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { loadDesign } from "@/game/design";
import type { Color, Design, Difficulty } from "@/game/types";
import { sfx } from "@/lib/sfx";
import { Home, RotateCcw, RefreshCw, FlipVertical2, Volume2, VolumeX, ScrollText, Settings2 } from "lucide-react";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Play — Design Your Own Chess" },
      { name: "description", content: "Play your chosen chess game against the AI." },
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
    status.kind === "checkmate" ? `Checkmate — ${winner === "w" ? "White" : "Black"} wins`
    : status.kind === "royal-loss" ? `Royal captured — ${winner === "w" ? "White" : "Black"} wins`
    : status.kind === "stalemate" ? "Stalemate"
    : check ? `${state.turn === "w" ? "White" : "Black"} in check`
    : `${state.turn === "w" ? "White" : "Black"} to move`;

  const dropTargets = selectedDrop ? legalDropSquares(selectedDrop) : [];
  const hasReserves = Object.values(state.reserves.w).some((n) => n > 0) ||
                      Object.values(state.reserves.b).some((n) => n > 0);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Minimal top bar */}
      <header className="px-3 py-2 flex items-center justify-between gap-2 border-b">
        <Link to="/">
          <Button variant="ghost" size="icon" aria-label="Home">
            <Home className="h-4 w-4" />
          </Button>
        </Link>
        <div className="text-sm font-display truncate">{statusLabel}</div>
        <div className="flex items-center gap-1">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Move history">
                <ScrollText className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Move history</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                <MoveHistory state={state} />
                <Captured state={state} />
              </div>
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Game settings">
                <Settings2 className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader>
                <SheetTitle>Game</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
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
                <div className="flex gap-2">
                  <Button onClick={() => setFlipped(!flipped)} variant="outline" size="sm" className="flex-1">
                    <FlipVertical2 className="h-4 w-4 mr-1" /> Flip board
                  </Button>
                  <Button onClick={() => setMuted(!muted)} variant="outline" size="sm" className="flex-1">
                    {muted ? <VolumeX className="h-4 w-4 mr-1" /> : <Volume2 className="h-4 w-4 mr-1" />}
                    {muted ? "Unmute" : "Mute"}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Board fills the rest */}
      <main className="flex-1 flex flex-col items-center justify-center gap-3 p-3">
        {hasReserves && (
          <ReservesPanel
            state={state}
            color={state.turn === humanColor ? humanColor : (humanColor === "w" ? "b" : "w")}
            selectedDrop={selectedDrop}
            onSelectDrop={setSelectedDrop}
            disabled={state.turn !== humanColor || status.kind !== "playing"}
          />
        )}
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
