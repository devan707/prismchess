import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PieceById } from "./PieceGlyph";
import type { Color, PieceDef, PieceId } from "@/game/types";

interface Props {
  open: boolean;
  color: Color;
  options: PieceId[];
  registry: Record<PieceId, PieceDef>;
  onChoose: (p: PieceId) => void;
}

export function PromotionDialog({ open, color, options, registry, onChoose }: Props) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Promote pawn</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap justify-center gap-3 py-2">
          {options.map((id) => (
            <Button
              key={id}
              variant="outline"
              className="h-20 w-20 text-4xl"
              onClick={() => onChoose(id)}
            >
              <PieceById id={id} color={color} def={registry[id]} className="text-5xl" />
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
