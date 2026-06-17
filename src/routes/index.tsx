import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Board } from "@/components/chess/Board";
import { useGame } from "@/hooks/useGame";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { Captured, MoveHistory } from "@/components/chess/MoveHistory";
import { BalanceTester } from "@/components/chess/BalanceTester";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VARIANTS, DEFAULT_VARIANT_ID, type Color, type Difficulty } from "@/game/types";
import { sfx } from "@/lib/sfx";
import { RotateCcw, RefreshCw, FlipVertical2, Volume2, VolumeX } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mini Chess — Compact 5×5 and 6×6 chess variants with AI" },
      { name: "description", content: "Polished mini chess variants on 5×5 and 6×6 boards. Play against an AI on Easy, Medium, or Hard, and run AI-vs-AI matches to test balance." },
      { property: "og:title", content: "Mini Chess — 5×5 and 6×6" },
      { property: "og:description", content: "Compact chess variants: 5×5 (R K B N R) and 6×6 (R B K Q B R). Three AI difficulties and a built-in balance tester." },
    ],
  }),
  component: Index,
});

function StatusBadge({ kind }: { kind: string }) {
  const cls =
    kind === "Checkmate" ? "bg-destructive text-destructive-foreground" :
    kind === "Check" ? "bg-accent text-accent-foreground" :
    kind === "Stalemate" ? "bg-muted text-muted-foreground" :
    "bg-primary text-primary-foreground";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{kind}</span>;
}

function Index() {
  const [humanColor, setHumanColor] = useState<Color>("w");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [variantId, setVariantId] = useState<string>(DEFAULT_VARIANT_ID);
  const [flipped, setFlipped] = useState(false);
  const [muted, setMuted] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <GameView
      key={`${resetKey}:${variantId}`}
      humanColor={humanColor}
      difficulty={difficulty}
      variantId={variantId}
      flipped={flipped}
      muted={muted}
      setHumanColor={setHumanColor}
      setDifficulty={setDifficulty}
      setVariantId={(v) => { setVariantId(v); setResetKey((k) => k + 1); }}
      setFlipped={setFlipped}
      setMuted={(m) => { sfx.setMuted(m); setMuted(m); }}
      onNewGame={() => setResetKey((k) => k + 1)}
    />
  );
}

interface GVProps {
  humanColor: Color;
  difficulty: Difficulty;
  variantId: string;
  flipped: boolean;
  muted: boolean;
  setHumanColor: (c: Color) => void;
  setDifficulty: (d: Difficulty) => void;
  setVariantId: (v: string) => void;
  setFlipped: (f: boolean) => void;
  setMuted: (m: boolean) => void;
  onNewGame: () => void;
}

function GameView({ humanColor, difficulty, variantId, flipped, muted, setHumanColor, setDifficulty, setVariantId, setFlipped, setMuted, onNewGame }: GVProps) {
  const game = useGame({ humanColor, difficulty, variantId });
  const { state, status, tryMove, legalFor, undo, pendingPromotion, promotionOptions, confirmPromotion } = game;
  const variant = VARIANTS[variantId] ?? VARIANTS[DEFAULT_VARIANT_ID];

  const statusLabel =
    status.kind === "checkmate"
      ? `Checkmate — ${status.winner === "w" ? "White" : "Black"} wins`
      : status.kind === "stalemate"
        ? "Stalemate"
        : status.check
          ? `${state.turn === "w" ? "White" : "Black"} in check`
          : `${state.turn === "w" ? "White" : "Black"} to move`;

  const badgeKind =
    status.kind === "checkmate" ? "Checkmate" :
    status.kind === "stalemate" ? "Stalemate" :
    status.check ? "Check" : "Playing";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-6xl mx-auto px-4 pt-8 pb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">Mini Chess <span className="text-primary">{variant.size}×{variant.size}</span></h1>
          <p className="text-sm text-muted-foreground mt-1">{variant.description}</p>
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
        <section className="flex flex-col items-center gap-4">
          <div className="w-full max-w-[560px] flex items-center justify-between">
            <StatusBadge kind={badgeKind} />
            <span className="font-display text-lg">{statusLabel}</span>
          </div>
          <Board
            state={state}
            humanColor={humanColor}
            flipped={flipped}
            legalFor={legalFor}
            onMove={(f, t) => tryMove(f, t)}
            disabled={status.kind !== "playing"}
          />
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg border bg-card p-3 space-y-3">
            <h2 className="font-display text-base font-semibold">Game</h2>
            <div>
              <label className="text-xs text-muted-foreground">Variant</label>
              <Select value={variantId} onValueChange={(v) => setVariantId(v)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[5, 6].map((sz) => {
                    const group = Object.values(VARIANTS).filter((v) => v.size === sz);
                    if (group.length === 0) return null;
                    return (
                      <div key={sz}>
                        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{sz}×{sz} board</div>
                        {group.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Play as</label>
                <Select value={humanColor} onValueChange={(v) => { setHumanColor(v as Color); onNewGame(); }}>
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
          <BalanceTester variantId={variantId} />
        </aside>
      </main>

      <PromotionDialog
        open={!!pendingPromotion}
        color={humanColor}
        options={promotionOptions}
        onChoose={(p) => confirmPromotion(p)}
      />
    </div>
  );
}
