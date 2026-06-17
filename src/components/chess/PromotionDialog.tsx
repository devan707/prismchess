import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PieceGlyph } from "./PieceGlyph";
import type { Color } from "@/game/types";

interface Props {
  open: boolean;
  color: Color;
  onChoose: (p: "N" | "B") => void;
}

export function PromotionDialog({ open, color, onChoose }: Props) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-display">Promote pawn</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center gap-4 py-2">
          {(["N", "B"] as const).map((t) => (
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
