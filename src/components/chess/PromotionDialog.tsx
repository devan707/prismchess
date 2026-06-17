import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PieceGlyph } from "./PieceGlyph";
import type { Color, PromotionPiece } from "@/game/types";

interface Props {
  open: boolean;
  color: Color;
  options: PromotionPiece[];
  onChoose: (p: PromotionPiece) => void;
}

export function PromotionDialog({ open, color, options, onChoose }: Props) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Promote pawn</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap justify-center gap-3 py-2">
          {options.map((t) => (
            <Button
              key={t}
              variant="outline"
              className="h-20 w-20 text-4xl"
              onClick={() => onChoose(t)}
            >
              <PieceGlyph piece={{ type: t, color }} className="text-5xl" />
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
