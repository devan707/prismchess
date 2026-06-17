import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Brain, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import { Board } from "@/components/chess/Board";
import { analyzeGame, fmtMove } from "@/lib/api/analyze-game.functions";
import { loadPlaybook, savePlaybook, resetPlaybook, type Playbook } from "@/game/ai/playbook";
import { initialStateFromDesign, replayMoves } from "@/game/rules";
import type { Color, Design, Difficulty, GameState, Square } from "@/game/types";

type Turn = { role: "user" | "assistant"; content: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: GameState;
  design: Design;
  aiColor: Color;
  humanColor: Color;
  difficulty: Difficulty;
  outcome: "aiWon" | "aiLost" | "draw" | "unknown";
  designName: string;
}

export function PostGameAnalysis({ open, onOpenChange, state, design, aiColor, humanColor, difficulty, outcome, designName }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [playbook, setPlaybookState] = useState<Playbook>(() => loadPlaybook());
  const [error, setError] = useState<string | null>(null);
  // viewIndex: number of moves applied. 0 = starting position, history.length = final position.
  const [viewIndex, setViewIndex] = useState<number>(state.history.length);
  const initRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const runAnalyze = useServerFn(analyzeGame);

  const moves = useMemo(
    () => state.history.map((m, i) => fmtMove(m, state.cols, i + 1, state.registry)),
    [state.history, state.cols, state.registry],
  );
  const legend = useMemo(() => {
    const seen = new Set<string>();
    const lines: string[] = [
      "Side prefix in move list: (W)=White, (B)=Black. Piece names are spelled out — do NOT shorten or guess.",
    ];
    for (const [id, def] of Object.entries(state.registry)) {
      if (seen.has(id)) continue;
      seen.add(id);
      lines.push(`${def.name} [id=${id}]${def.special ? ` (${def.special})` : ""}`);
    }
    return lines.join("\n");
  }, [state.registry]);

  const displayed = useMemo(() => {
    if (viewIndex >= state.history.length) return state;
    return replayMoves(state.history.slice(0, viewIndex), initialStateFromDesign(design));
  }, [viewIndex, state, design]);

  const currentMoveLabel = viewIndex > 0 ? moves[viewIndex - 1] : null;

  const runReview = async (userMessage?: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await runAnalyze({
        data: {
          design: { name: designName, rows: state.rows, cols: state.cols, pieceLegend: legend },
          aiSide: aiColor,
          aiDifficulty: difficulty,
          outcome,
          moves,
          currentPlaybook: playbook,
          priorTurns: turns,
          userMessage,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const nextPlaybook: Playbook = {
        ...result.updatedPlaybook,
        gamesReviewed: (playbook.gamesReviewed ?? 0) + (userMessage ? 0 : 1),
      };
      savePlaybook(nextPlaybook);
      setPlaybookState(nextPlaybook);
      setTurns((prev) => [
        ...prev,
        ...(userMessage ? [{ role: "user" as const, content: userMessage }] : []),
        { role: "assistant" as const, content: result.analysis },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Kick off the initial review the first time the dialog opens after a game.
  useEffect(() => {
    if (!open) { initRef.current = false; return; }
    if (initRef.current) return;
    initRef.current = true;
    setTurns([]);
    setError(null);
    // Start at the final position so the user immediately sees the checkmating move.
    setViewIndex(state.history.length);
    void runReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    // Tag feedback with the move the user is currently viewing so the AI knows what they mean.
    const tagged = currentMoveLabel
      ? `[Viewing move ${viewIndex}: ${currentMoveLabel}]\n${text}`
      : text;
    setInput("");
    await runReview(tagged);
  };

  const onReset = () => {
    const fresh = resetPlaybook();
    setPlaybookState(fresh);
    setTurns([]);
    initRef.current = false;
  };

  const total = state.history.length;
  const noopMove = (_f: Square, _t: Square) => false;
  const noLegal = (_sq: Square | null): Square[] => [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" /> Post-game review
          </DialogTitle>
          <DialogDescription>
            Step through the game move by move. Leave a note on any move and the AI will use it to play smarter next time.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <Badge variant="secondary"><Sparkles className="h-3 w-3 mr-1" />{playbook.lessons.length} lessons</Badge>
            <Badge variant="secondary">caution ×{playbook.cautionMultiplier.toFixed(2)}</Badge>
            <Badge variant="secondary">aggression {playbook.aggressionBonus >= 0 ? "+" : ""}{Math.round(playbook.aggressionBonus)}</Badge>
            <Badge variant="secondary">{playbook.gamesReviewed} games reviewed</Badge>
            <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={onReset} title="Wipe all learned lessons">
              <RotateCcw className="h-3 w-3 mr-1" /> Reset playbook
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid md:grid-cols-[minmax(260px,360px)_1fr] gap-0 overflow-hidden">
          {/* Replay panel */}
          <div className="border-b md:border-b-0 md:border-r p-3 flex flex-col gap-2 min-h-0 overflow-y-auto">
            <div className="text-xs font-semibold text-muted-foreground">
              {viewIndex === 0
                ? "Starting position"
                : `Move ${viewIndex} of ${total}${currentMoveLabel ? ` — ${currentMoveLabel}` : ""}`}
            </div>
            <div className="mx-auto w-full max-w-[320px]">
              <Board
                state={displayed}
                humanColor={humanColor}
                flipped={false}
                legalFor={noLegal}
                onMove={noopMove}
                disabled
              />
            </div>
            <div className="flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Jump to start"
                onClick={() => setViewIndex(0)} disabled={viewIndex === 0}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Previous move"
                onClick={() => setViewIndex((i) => Math.max(0, i - 1))} disabled={viewIndex === 0}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums text-xs min-w-[4.5rem] text-center">{viewIndex} / {total}</span>
              <Button variant="ghost" size="icon" aria-label="Next move"
                onClick={() => setViewIndex((i) => Math.min(total, i + 1))} disabled={viewIndex >= total}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Jump to end"
                onClick={() => setViewIndex(total)} disabled={viewIndex >= total}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center px-1">
              Notes you send below are tagged with the move shown here.
            </p>
          </div>

          {/* Conversation panel */}
          <div className="flex flex-col min-h-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {turns.length === 0 && !loading && !error && (
                <p className="text-sm text-muted-foreground">Starting analysis…</p>
              )}
              {turns.map((t, i) => (
                <div key={i} className={t.role === "user" ? "flex justify-end" : ""}>
                  {t.role === "user" ? (
                    <div className="max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap">
                      {t.content}
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                      <ReactMarkdown>{t.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </div>
              )}
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</div>
              )}
              {playbook.lessons.length > 0 && (
                <details className="mt-4 rounded-md border bg-muted/40">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">Current lessons ({playbook.lessons.length})</summary>
                  <ul className="px-5 py-2 list-disc text-xs space-y-1">
                    {playbook.lessons.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </details>
              )}
            </div>

            <div className="border-t p-3 flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  currentMoveLabel
                    ? `Note about move ${viewIndex} (${currentMoveLabel})…`
                    : "Give the AI feedback — e.g. 'You sacrificed the Wizard for no reason.'"
                }
                className="min-h-[60px] max-h-32 resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void onSend(); }
                }}
                disabled={loading}
              />
              <Button onClick={onSend} disabled={loading || !input.trim()} size="icon" aria-label="Send feedback">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
