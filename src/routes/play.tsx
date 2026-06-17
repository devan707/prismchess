import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createPortal } from "react-dom";
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
import { loadDesign, loadCurrentMeta, type CurrentGameMeta } from "@/game/design";
import { initialStateFromDesign, replayMoves } from "@/game/rules";
import type { Color, Design, Difficulty, Square } from "@/game/types";
import { sfx } from "@/lib/sfx";
import { PostGameAnalysis } from "@/components/chess/PostGameAnalysis";
import { recordSoloGame } from "@/lib/history.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { TutorialDialog } from "@/components/TutorialDialog";
import { hasSeenTutorial } from "@/lib/tutorial-state";
import { buildBaseTutorial, type GameTutorial } from "@/game/tutorials";
import { Home, RotateCcw, Undo, RefreshCw, FlipVertical2, Volume2, VolumeX, ScrollText, Settings2, Flag, DoorOpen, Info, X, Brain, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Share2, Copy, MessagesSquare, Twitter, BookOpen } from "lucide-react";
import { toast } from "sonner";


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
  const [meta, setMeta] = useState<CurrentGameMeta | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    const d = loadDesign();
    if (!d) { navigate({ to: "/" }); return; }
    setDesign(d);
    const m = loadCurrentMeta();
    setMeta(m);
    if (m?.tutorial && !hasSeenTutorial(m.id)) {
      setTutorialOpen(true);
    }
  }, [navigate]);

  if (!design) return null;
  const tutorial: GameTutorial | null = meta?.tutorial
    ? { slides: meta.tutorial.slides as GameTutorial["slides"] }
    : meta
      ? buildBaseTutorial({ name: meta.name, description: meta.description ?? "", design })
      : null;

  return (
    <>
      <Play design={design} />
      {meta && tutorial && (
        <TutorialDialog
          gameId={meta.id}
          gameName={meta.name}
          tutorial={tutorial}
          open={tutorialOpen}
          onOpenChange={setTutorialOpen}
          isFirstTime={!hasSeenTutorial(meta.id)}
        />
      )}
    </>
  );
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
    state, status, tryMove, tryDrop, legalFor, legalDropSquares,
    selectedDrop, setSelectedDrop,
    undo, takeback, pendingPromotion, promotionOptions, confirmPromotion,
  } = game;

  const [resignedBy, setResignedBy] = useState<Color | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [tipsOn, setTipsOn] = useState<boolean>(() => {
    try { return localStorage.getItem("play:tips") !== "0"; } catch { return true; }
  });
  const [takebackOn, setTakebackOn] = useState<boolean>(() => {
    try { return localStorage.getItem("play:takeback") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("play:takeback", takebackOn ? "1" : "0"); } catch {}
  }, [takebackOn]);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setOverlayHost(document.body);
  }, []);

  // History navigation: viewIndex = number of moves to show (0..history.length).
  // When equal to history.length the live state is shown.
  const [viewIndex, setViewIndex] = useState<number>(state.history.length);
  useEffect(() => {
    // Snap to latest whenever a new move is played.
    setViewIndex(state.history.length);
  }, [state.history.length]);

  const displayedState = useMemo(() => {
    if (viewIndex >= state.history.length) return state;
    return replayMoves(state.history.slice(0, viewIndex), initialStateFromDesign(design));
  }, [viewIndex, state, design]);
  const viewingPast = viewIndex < state.history.length;

  const handleSelectionChange = useCallback((sq: Square | null) => {
    setSelectedSquare(sq);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("play:tips", tipsOn ? "1" : "0"); } catch {}
  }, [tipsOn]);

  const selectedPiece = selectedSquare ? displayedState.board[selectedSquare.r][selectedSquare.c] : null;
  const selectedDef = selectedPiece ? displayedState.registry[selectedPiece.id] : null;



  const check = status.kind === "playing" ? status.check : false;
  const winner = resignedBy
    ? (resignedBy === "w" ? "b" : "w")
    : (status.kind === "checkmate" || status.kind === "royal-loss" ? status.winner : null);

  const terminal = resignedBy !== null || status.kind === "checkmate" || status.kind === "royal-loss" || status.kind === "stalemate";

  const winnerName = winner === "w" ? "White" : winner === "b" ? "Black" : null;
  const endTitle =
    status.kind === "stalemate" ? "Draw — Stalemate"
    : resignedBy ? `${winnerName} wins by resignation`
    : status.kind === "checkmate" ? `${winnerName} wins by checkmate`
    : status.kind === "royal-loss" ? `${winnerName} wins — Royal captured`
    : null;

  const statusLabel =
    endTitle
    ?? (check ? `${state.turn === "w" ? "White" : "Black"} in check`
    : `${state.turn === "w" ? "White" : "Black"} to move`);

  // Delay the end-of-game modal so the player can see the final board.
  const [showEndModal, setShowEndModal] = useState(false);
  useEffect(() => {
    if (!terminal) { setShowEndModal(false); return; }
    const t = setTimeout(() => setShowEndModal(true), 2200);
    return () => clearTimeout(t);
  }, [terminal]);

  // Persist the finished solo game once (if the user is signed in).
  const recordSoloFn = useServerFn(recordSoloGame);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!terminal) return;
    const reason =
      resignedBy ? "resign"
      : status.kind === "checkmate" ? "checkmate"
      : status.kind === "royal-loss" ? "royal_loss"
      : status.kind === "stalemate" ? "stalemate"
      : null;
    if (!reason) return;
    const result: "w" | "b" | "draw" =
      reason === "stalemate" ? "draw"
      : reason === "resign" ? (resignedBy === "w" ? "b" : "w")
      : (status.kind === "checkmate" || status.kind === "royal-loss") ? status.winner
      : "draw";
    const key = `${state.history.length}:${reason}:${result}`;
    if (savedKey === key) return;
    setSavedKey(key);
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return;
        await recordSoloFn({
          data: {
            designName: `${design.rows}×${design.cols} Custom`,
            design: design as unknown as Record<string, unknown>,
            difficulty,
            humanColor,
            result,
            resultReason: reason,
            moves: state.history as unknown as Record<string, unknown>[],
          },
        });
      } catch {
        // Non-fatal; the player can still review the game.
      }
    })();
  }, [terminal, status, resignedBy, state.history, design, difficulty, humanColor, recordSoloFn, savedKey]);

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
                  <Button onClick={takeback} size="sm" variant="outline" className="flex-1" disabled={state.history.length === 0 || terminal}>
                    <Undo className="h-4 w-4 mr-1" /> Take back last move
                  </Button>
                  <Button
                    onClick={() => setTakebackOn((v) => !v)}
                    size="sm"
                    variant={takebackOn ? "secondary" : "outline"}
                    aria-pressed={takebackOn}
                  >
                    {takebackOn ? "On-board: On" : "On-board: Off"}
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
          <ShareGameButton design={design} />
        </div>
      </header>

      {/* Board fills the rest */}
      <main className="flex-1 flex flex-col items-center justify-center gap-3 p-3 relative">
        {hasReserves && (
          <ReservesPanel
            state={displayedState}
            color={state.turn === humanColor ? humanColor : (humanColor === "w" ? "b" : "w")}
            selectedDrop={selectedDrop}
            onSelectDrop={setSelectedDrop}
            disabled={viewingPast || state.turn !== humanColor || terminal}
          />
        )}
        <Board
          state={displayedState}
          humanColor={humanColor}
          flipped={flipped}
          legalFor={legalFor}
          onMove={(f, t) => {
            if (viewingPast) return false;
            return tryMove(f, t);
          }}
          dropPiece={selectedDrop}
          dropTargets={dropTargets}
          onDrop={(id, to) => viewingPast ? false : tryDrop(id, to)}
          disabled={viewingPast || terminal}
          onSelectionChange={handleSelectionChange}
        />

        {takebackOn && state.history.length > 0 && !terminal && !viewingPast && (
          <Button
            onClick={takeback}
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
          >
            <Undo className="h-3.5 w-3.5 mr-1" /> Take back
          </Button>
        )}

        {/* History scrubber */}
        {state.history.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Button variant="ghost" size="icon" aria-label="Jump to start"
              onClick={() => setViewIndex(0)} disabled={viewIndex === 0}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Step back"
              onClick={() => setViewIndex((i) => Math.max(0, i - 1))} disabled={viewIndex === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums min-w-[5rem] text-center">
              {viewingPast ? `Move ${viewIndex} / ${state.history.length}` : `Move ${state.history.length}`}
            </span>
            <Button variant="ghost" size="icon" aria-label="Step forward"
              onClick={() => setViewIndex((i) => Math.min(state.history.length, i + 1))}
              disabled={!viewingPast}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Jump to latest"
              onClick={() => setViewIndex(state.history.length)} disabled={!viewingPast}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Graveyard state={displayedState} humanColor={humanColor} />





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


      </main>

      {terminal && showEndModal && !reviewOpen && overlayHost && createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 pointer-events-auto touch-none"
          role="presentation"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.preventDefault()}
        >
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
        </div>,
        overlayHost,
      )}

      <PostGameAnalysis
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        state={state}
        design={design}
        humanColor={humanColor}
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

function ShareGameButton({ design }: { design: Design }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const gameName = `${design.rows}×${design.cols} ${design.placements.length}-piece variant`;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "https://kingdom-chess.lovable.app/";
  const shareText = `I'm playing ${gameName} on Prism Chess — design your own variant and play vs AI.`;

  const stashDesign = () => {
    try {
      localStorage.setItem(
        "forum:pendingShare",
        JSON.stringify({ design, name: gameName }),
      );
    } catch {}
  };

  const nativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Prism Chess", text: shareText, url: shareUrl });
        setOpen(false);
      } else {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        toast.success("Share text copied to clipboard");
      }
    } catch {}
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const shareToCommunity = () => {
    stashDesign();
    setOpen(false);
    navigate({ to: "/forum/suggest" });
  };

  const tweet = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Share game">
          <Share2 className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Share this game</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-muted-foreground text-xs">{gameName}</p>
          <Button onClick={nativeShare} className="w-full justify-start" variant="outline">
            <Share2 className="h-4 w-4 mr-2" /> Share via…
          </Button>
          <Button onClick={shareToCommunity} className="w-full justify-start">
            <MessagesSquare className="h-4 w-4 mr-2" /> Post to community
          </Button>
          <Button onClick={tweet} className="w-full justify-start" variant="outline">
            <Twitter className="h-4 w-4 mr-2" /> Share on X
          </Button>
          <Button onClick={copyLink} className="w-full justify-start" variant="outline">
            <Copy className="h-4 w-4 mr-2" /> Copy link
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
