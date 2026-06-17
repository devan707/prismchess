import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { PieceGlyph } from "@/components/chess/PieceGlyph";
import type { GameTutorial } from "@/game/tutorials";
import { PIECE_LIBRARY } from "@/game/pieces";
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
}

export function TutorialDialog({ gameId, gameName, tutorial, open, onOpenChange, isFirstTime }: Props) {
  const [idx, setIdx] = useState(0);
  const slides = tutorial.slides;
  const slide = slides[Math.min(idx, slides.length - 1)];
  const last = idx >= slides.length - 1;

  const close = () => {
    markTutorialSeen(gameId);
    setIdx(0);
    onOpenChange(false);
  };

  if (!slide) return null;

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
          {slide.pieceId && PIECE_LIBRARY[slide.pieceId] && (
            <div className="flex items-center gap-3 mb-3 rounded-lg border bg-card/60 p-3">
              <div className="h-12 w-12 rounded-md bg-background border flex items-center justify-center">
                <PieceGlyph pieceId={slide.pieceId} color="w" size={36} />
              </div>
              <div>
                <div className="font-display text-sm font-semibold">
                  {PIECE_LIBRARY[slide.pieceId].name}
                </div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  Custom piece
                </div>
              </div>
            </div>
          )}
          {slide.body && (
            <p className="text-sm text-foreground/90 leading-relaxed">{slide.body}</p>
          )}
          {slide.bullets && slide.bullets.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-sm text-foreground/90 list-disc pl-5">
              {slide.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-center gap-1 pb-2" aria-hidden>
          {slides.map((_, i) => (
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
