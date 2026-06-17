import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Board } from "@/components/chess/Board";
import { useGame } from "@/hooks/useGame";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { Captured, MoveHistory } from "@/components/chess/MoveHistory";
import { Graveyard } from "@/components/chess/Graveyard";
import { ReservesPanel } from "@/components/designer/ReservesPanel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { loadDesign } from "@/game/design";
import type { Color, Design, Difficulty, PieceId, Square } from "@/game/types";
import { sfx } from "@/lib/sfx";
import { PostGameAnalysis } from "@/components/chess/PostGameAnalysis";
import { Home, RotateCcw, RefreshCw, FlipVertical2, Volume2, VolumeX, ScrollText, Settings2, Flag, DoorOpen, Info, X, Brain } from "lucide-react";


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
  const navigate = useNavigate();
  const game = useGame({ humanColor, difficulty, design });
  const {
    state, status, tryMove, tryDrop, tryResurrect, legalFor, legalDropSquares,
    selectedDrop, setSelectedDrop,
    undo, pendingPromotion, promotionOptions, confirmPromotion,
  } = game;

  const [resignedBy, setResignedBy] = useState<Color | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tipsOn, setTipsOn] = useState<boolean>(() => {
    try { return localStorage.getItem("play:tips") !== "0"; } catch { return true; }
  });
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [resurrectChoice, setResurrectChoice] = useState<PieceId | null>(null);
  const handleSelectionChange = useCallback((sq: Square | null) => {
    setSelectedSquare(sq);
    setResurrectChoice(null);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("play:tips", tipsOn ? "1" : "0"); } catch {}
  }, [tipsOn]);

  const selectedPiece = selectedSquare ? state.board[selectedSquare.r][selectedSquare.c] : null;
  const selectedDef = selectedPiece ? state.registry[selectedPiece.id] : null;
  const isHumanNecromancer = !!(
    selectedPiece &&
    selectedPiece.color === humanColor &&
    state.registry[selectedPiece.id]?.special === "necromancer"
  );
  // Friendly fallen = pieces of humanColor that the opponent captured.
  const humansFallen = state.captured[humanColor === "w" ? "b" : "w"];
  const resurrectMode = isHumanNecromancer && humansFallen.length > 0;



  const check = status.kind === "playing" ? status.check : false;
  const winner = resignedBy
    ? (resignedBy === "w" ? "b" : "w")
    : (status.kind === "checkmate" || status.kind === "royal-loss" ? status.winner : null);

  const terminal = resignedBy !== null || status.kind === "checkmate" || status.kind === "royal-loss" || status.kind === "stalemate";

  const statusLabel =
    resignedBy ? `${resignedBy === humanColor ? "You" : "Opponent"} resigned — ${winner === "w" ? "White" : "Black"} wins`
    : status.kind === "checkmate" ? `Checkmate — ${winner === "w" ? "White" : "Black"} wins`
    : status.kind === "royal-loss" ? `Royal captured — ${winner === "w" ? "White" : "Black"} wins`
    : status.kind === "stalemate" ? "Stalemate"
    : check ? `${state.turn === "w" ? "White" : "Black"} in check`
    : `${state.turn === "w" ? "White" : "Black"} to move`;

  const dropTargets = selectedDrop ? legalDropSquares(selectedDrop) : [];
  const hasReserves = Object.values(state.reserves.w).some((n) => n > 0) ||
                      Object.values(state.reserves.b).some((n) => n > 0);

  const handleResign = () => setResignedBy(humanColor);
  const handleQuit = () => navigate({ to: "/" });
  const handleNewGame = () => { setResignedBy(null); onNewGame(); };

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
          <Button
            variant={tipsOn ? "secondary" : "ghost"}
            size="icon"
            aria-label={tipsOn ? "Hide piece tips" : "Show piece tips"}
            aria-pressed={tipsOn}
            onClick={() => setTipsOn((v) => !v)}
          >
            <Info className="h-4 w-4" />
          </Button>

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
                  <Button onClick={handleNewGame} size="sm" className="flex-1">
                    <RefreshCw className="h-4 w-4 mr-1" /> New game
                  </Button>
                  <Button onClick={undo} size="sm" variant="outline" className="flex-1" disabled={state.history.length === 0 || terminal}>
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
                <div className="border-t pt-3 space-y-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full" disabled={terminal}>
                        <Flag className="h-4 w-4 mr-1" /> Resign
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Resign this game?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Your opponent will be awarded the win. You can start a new game right after.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep playing</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResign}>Resign</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full">
                        <DoorOpen className="h-4 w-4 mr-1" /> Quit to menu
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogTitle>Leave this game?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your current progress will be lost.
                      </AlertDialogDescription>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Stay</AlertDialogCancel>
                        <AlertDialogAction onClick={handleQuit}>Quit</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Board fills the rest */}
      <main className="flex-1 flex flex-col items-center justify-center gap-3 p-3 relative">
        {hasReserves && (
          <ReservesPanel
            state={state}
            color={state.turn === humanColor ? humanColor : (humanColor === "w" ? "b" : "w")}
            selectedDrop={selectedDrop}
            onSelectDrop={setSelectedDrop}
            disabled={state.turn !== humanColor || terminal}
          />
        )}
        <Board
          state={state}
          humanColor={humanColor}
          flipped={flipped}
          legalFor={legalFor}
          onMove={(f, t) => {
            // If a human necromancer is selected and a fallen piece has been
            // picked, route the move through the resurrect path so the right
            // piece comes back. Falls back to a normal move otherwise.
            if (resurrectMode && resurrectChoice) {
              if (tryResurrect(f, t, resurrectChoice)) {
                setResurrectChoice(null);
                return true;
              }
            }
            return tryMove(f, t);
          }}
          dropPiece={selectedDrop}
          dropTargets={dropTargets}
          onDrop={(id, to) => tryDrop(id, to)}
          disabled={terminal}
          onSelectionChange={handleSelectionChange}
        />

        <Graveyard
          state={state}
          humanColor={humanColor}
          resurrectMode={resurrectMode}
          resurrectChoice={resurrectChoice}
          onPickResurrect={setResurrectChoice}
        />


        {tipsOn && (
          <div
            className="w-full max-w-[min(92vw,640px)] rounded-lg border bg-card px-3 py-2 text-sm shadow-sm overflow-y-auto"
            style={{ height: "9rem" }}
          >
            {selectedDef && selectedPiece ? (
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-foreground">
                    {selectedPiece.color === "w" ? "White" : "Black"} {selectedDef.name}
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug mt-1">
                    {selectedDef.description}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                Click any piece to see how it moves.
              </div>
            )}
          </div>
        )}


        {terminal && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4">
            <div className="bg-card border rounded-xl shadow-2xl p-6 text-center max-w-xs space-y-3">
              <div className="font-display text-xl font-bold">{statusLabel}</div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => setReviewOpen(true)} variant="secondary">
                  <Brain className="h-4 w-4 mr-1" /> Review with AI
                </Button>
                <Button onClick={handleNewGame}>
                  <RefreshCw className="h-4 w-4 mr-1" /> New game
                </Button>
                <Button variant="outline" onClick={handleQuit}>
                  <Home className="h-4 w-4 mr-1" /> Back to menu
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      <PostGameAnalysis
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        state={state}
        aiColor={humanColor === "w" ? "b" : "w"}
        difficulty={difficulty}
        outcome={
          !terminal ? "unknown"
          : winner == null ? "draw"
          : winner === humanColor ? "aiLost"
          : "aiWon"
        }
        designName={`${design.rows}×${design.cols} Custom`}
      />

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
