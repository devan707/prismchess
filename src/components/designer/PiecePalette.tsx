import { useState } from "react";
import type { Color, PieceDef, PieceId } from "@/game/types";
import { PieceById } from "@/components/chess/PieceGlyph";
import { Button } from "@/components/ui/button";

interface Props {
  pieces: PieceDef[];
  color: Color;
  onColorChange: (c: Color) => void;
  reserves: { w: Record<PieceId, number>; b: Record<PieceId, number> };
  onReserveChange: (pieceId: PieceId, color: Color, count: number) => void;
}

export function PiecePalette({ pieces, color, onColorChange, reserves, onReserveChange }: Props) {
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
        Drag onto the board. Right-click a square to clear. Drop pieces use the reserve count.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {pieces.map((def) => {
          const reserveCount = def.defaultReserve != null ? reserves[color][def.id] ?? 0 : null;
          return (
            <div
              key={def.id}
              className="relative rounded-md border bg-background hover:bg-accent/40 transition flex flex-col items-center justify-center p-2 cursor-grab"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-piece", `${def.id}|${color}`);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onMouseEnter={() => setHovered(def.id)}
              onMouseLeave={() => setHovered((h) => (h === def.id ? null : h))}
              title={`${def.name}${def.description ? ` — ${def.description}` : ""}`}
            >
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
        if (!def?.description) return null;
        return <p className="text-[11px] text-muted-foreground border-t pt-2">{def.description}</p>;
      })()}
    </div>
  );
}
