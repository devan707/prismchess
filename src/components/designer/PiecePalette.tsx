import { useState } from "react";
import type { Color, PieceDef, PieceId } from "@/game/types";
import { PieceById } from "@/components/chess/PieceGlyph";
import { Eraser, X } from "lucide-react";
import { PieceWorthBadge } from "@/components/pieces/PieceWorthBadge";

interface Props {
  pieces: PieceDef[];
  color: Color;
  onColorChange: (c: Color) => void;
  reserves: { w: Record<PieceId, number>; b: Record<PieceId, number> };
  onReserveChange: (pieceId: PieceId, color: Color, count: number) => void;
  /** "erase" = clear-square tool, otherwise a piece id */
  selectedPiece: PieceId | "erase" | null;
  onSelectPiece: (id: PieceId | "erase" | null) => void;
  /** Whether a board square is currently selected — drives the helper hint. */
  hasSquareSelected: boolean;
  /** Ids of pieces that can be removed from this design's palette (custom pieces added via the library). */
  removableIds?: string[];
  onRemovePiece?: (id: PieceId) => void;
}

export function PiecePalette({
  pieces, color, onColorChange, reserves, onReserveChange,
  selectedPiece, onSelectPiece, hasSquareSelected, removableIds, onRemovePiece,
}: Props) {
  const [hovered, setHovered] = useState<PieceId | null>(null);
  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">Pieces</h3>
        <div className="flex rounded-md border overflow-hidden text-xs">
          <button
            className={`px-2 py-1 ${color === "w" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => onColorChange("w")}
          >White</button>
          <button
            className={`px-2 py-1 ${color === "b" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => onColorChange("b")}
          >Black</button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {hasSquareSelected
          ? "Square selected — click a piece to place it (or Empty to clear)."
          : "Click a piece, then click a square. Or drag pieces onto the board."}
      </p>
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => onSelectPiece(selectedPiece === "erase" ? null : "erase")}
          className={`relative rounded-md border bg-background hover:bg-accent/40 transition flex flex-col items-center justify-center p-2 ${selectedPiece === "erase" ? "ring-2 ring-primary" : ""}`}
          title="Empty — clears the chosen square"
        >
          <Eraser className="h-7 w-7 text-muted-foreground" />
          <span className="text-[10px] mt-1 text-muted-foreground">Empty</span>
        </button>
        {pieces.map((def) => {
          const reserveCount = def.defaultReserve != null ? reserves[color][def.id] ?? 0 : null;
          const isSelected = selectedPiece === def.id;
          const canRemove = !!removableIds?.includes(def.id) && !!onRemovePiece;
          return (
            <div
              key={def.id}
              className={`relative rounded-md border bg-background hover:bg-accent/40 transition flex flex-col items-center justify-center p-2 cursor-pointer ${isSelected ? "ring-2 ring-primary" : ""}`}
              draggable
              onClick={() => onSelectPiece(isSelected ? null : def.id)}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-piece", `${def.id}|${color}`);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onMouseEnter={() => setHovered(def.id)}
              onMouseLeave={() => setHovered((h) => (h === def.id ? null : h))}
              title={`${def.name}${def.description ? ` — ${def.description}` : ""}`}
            >
              {canRemove && (
                <button
                  type="button"
                  aria-label={`Remove ${def.name} from palette`}
                  className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow hover:scale-110 transition"
                  onClick={(e) => { e.stopPropagation(); onRemovePiece!(def.id); }}
                  title="Remove from this game"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <PieceById id={def.id} color={color} def={def} className="text-3xl" />
              <span className="text-[10px] mt-1 text-muted-foreground truncate w-full text-center">{def.name}</span>
              {reserveCount !== null && (
                <div className="absolute top-1 right-1 flex items-center gap-0.5">
                  <button
                    className="text-[10px] w-4 h-4 rounded bg-muted hover:bg-muted/80"
                    onClick={(e) => { e.stopPropagation(); onReserveChange(def.id, color, Math.max(0, reserveCount - 1)); }}
                  >−</button>
                  <span className="text-[10px] font-mono w-4 text-center">{reserveCount}</span>
                  <button
                    className="text-[10px] w-4 h-4 rounded bg-muted hover:bg-muted/80"
                    onClick={(e) => { e.stopPropagation(); onReserveChange(def.id, color, Math.min(5, reserveCount + 1)); }}
                  >+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {hovered && (() => {
        const def = pieces.find((p) => p.id === hovered);
        if (!def) return null;
        return (
          <div className="border-t pt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold">{def.name}</span>
              <PieceWorthBadge id={def.id} def={def} />
            </div>
            {def.description && (
              <p className="text-[11px] text-muted-foreground">{def.description}</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
