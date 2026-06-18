import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { PieceById } from "@/components/chess/PieceGlyph";
import { MoveDiagram } from "@/components/chess/MoveDiagram";
import { PieceReachPreview } from "@/components/pieces/PieceReachPreview";
import { PIECE_LIBRARY } from "@/game/pieces";
import type { GameTutorial } from "@/game/tutorials";
import type { PieceDef } from "@/game/types";
import type { MoveOption } from "@/game/customMovement";
import { markTutorialSeen } from "@/lib/tutorial-state";
import { cn } from "@/lib/utils";

interface Props {
  gameId: string;
  gameName: string;
  tutorial: GameTutorial;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Show "first time playing" banner. */
  isFirstTime?: boolean;
  /** User-defined pieces shipped with the variant — used to render diagrams
   *  for custom pieces that aren't in the built-in PIECE_LIBRARY. */
  customPieces?: PieceDef[];
}

export function TutorialDialog({
  gameId,
  gameName,
  tutorial,
  open,
  onOpenChange,
  isFirstTime,
  customPieces,
}: Props) {
  const [idx, setIdx] = useState(0);
  const slides = tutorial.slides;
  const slide = slides[Math.min(idx, slides.length - 1)];
  const last = idx >= slides.length - 1;

  const customById = useMemo(() => {
    const m = new Map<string, PieceDef>();
    for (const p of customPieces ?? []) m.set(p.id, p);
    return m;
  }, [customPieces]);

  const close = () => {
    markTutorialSeen(gameId);
    setIdx(0);
    onOpenChange(false);
  };

  if (!slide) return null;

  // Resolve the piece definition for this slide: prefer the variant's own
  // custom pieces (so a user-built Catapult shows its real diagram), and
  // fall back to the built-in library for stock pieces.
  const pid = slide.pieceId;
  const slideDef: PieceDef | undefined = pid
    ? customById.get(pid) ?? PIECE_LIBRARY[pid]
    : undefined;
  const builtinHasDiagram = pid ? !!PIECE_LIBRARY[pid] : false;
  const customOptions: MoveOption[] | undefined =
    pid && !builtinHasDiagram ? slideDef?.options : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
            <BookOpen className="h-3.5 w-3.5" />
            {isFirstTime ? "First time tutorial" : "Tutorial"}
            <span aria-hidden>·</span>
            <span className="truncate">{gameName}</span>
          </div>
          <DialogTitle className="font-display text-xl mt-1">{slide.title}</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3 min-h-[180px]">
          {pid && slideDef && (
            <div className="mb-3 rounded-lg border bg-card/60 p-3">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-12 w-12 rounded-md bg-background border flex items-center justify-center">
                  <PieceById
                    id={pid}
                    color="w"
                    def={slideDef}
                    className="h-9 w-9"
                  />
                </div>
                <div>
                  <div className="font-display text-sm font-semibold">
                    {slideDef.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Custom piece
                  </div>
                </div>
              </div>
              <div className="flex justify-center">
                {builtinHasDiagram ? (
                  <MoveDiagram id={pid} color="w" maxSize={180} />
                ) : customOptions && customOptions.length > 0 ? (
                  <PieceReachPreview
                    options={customOptions}
                    rangedSpec={slideDef.rangedCapture?.spec}
                    size={9}
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground italic">
                    Movement diagram unavailable for this piece.
                  </p>
                )}
              </div>
            </div>
          )}
          {slide.body && (
            <p className="text-sm text-foreground/90 leading-relaxed">{slide.body}</p>
          )}
          {slide.bullets && slide.bullets.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm text-foreground/90 list-disc pl-5">
              {slide.bullets.map((b: string, i: number) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-center gap-1 pb-2" aria-hidden>
          {slides.map((_slide, i: number) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === idx ? "w-5 bg-primary" : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-between bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <span className="text-xs text-muted-foreground">
            {idx + 1} / {slides.length}
          </span>
          {last ? (
            <Button size="sm" onClick={close}>
              Start playing
            </Button>
          ) : (
            <Button size="sm" onClick={() => setIdx((i) => Math.min(slides.length - 1, i + 1))}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
