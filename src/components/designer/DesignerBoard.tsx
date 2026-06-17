import type { Design, PieceDef, PieceId, Placement, Square } from "@/game/types";
import { PIECE_LIBRARY } from "@/game/pieces";
import { juggPartnerCandidates } from "@/game/design";
import { PieceGlyph } from "@/components/chess/PieceGlyph";

interface Props {
  design: Design;
  registry: Record<PieceId, PieceDef>;
  onChange: (placements: Placement[]) => void;
  mirror: boolean;
  selectedSquare: Square | null;
  onSelectSquare: (sq: Square | null) => void;
}

export function DesignerBoard({ design, registry, onChange, mirror, selectedSquare, onSelectSquare }: Props) {
  const { rows, cols } = design;
  const grid: (Placement | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const p of design.placements) {
    if (p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols) grid[p.r][p.c] = p;
  }

  const writeAt = (r: number, c: number, pieceId: PieceId | null, color: "w" | "b") => {
    const { rows, cols } = design;
    const wide = cols > rows;
    const mirrorOf = (sq: { r: number; c: number }) =>
      wide ? { r: sq.r, c: cols - 1 - sq.c } : { r: rows - 1 - sq.r, c: sq.c };

    let next: Placement[] = design.placements.filter((p) => !(p.r === r && p.c === c));
    if (mirror) {
      const m = mirrorOf({ r, c });
      next = next.filter((p) => !(p.r === m.r && p.c === m.c));
    }

    if (pieceId === "J") {
      for (const o of juggPartnerCandidates(rows, cols)) {
        const pr = r + o.dr, pc = c + o.dc;
        if (pr < 0 || pr >= rows || pc < 0 || pc >= cols) continue;
        if (next.some((p) => p.r === pr && p.c === pc)) continue;
        next.push({ r, c, pieceId: "J", color });
        next.push({ r: pr, c: pc, pieceId: "J", color });
        if (mirror) {
          const mPrim = mirrorOf({ r, c });
          const mPart = mirrorOf({ r: pr, c: pc });
          const mColor = color === "w" ? "b" : "w";
          next = next.filter((p) =>
            !(p.r === mPrim.r && p.c === mPrim.c) && !(p.r === mPart.r && p.c === mPart.c));
          next.push({ r: mPrim.r, c: mPrim.c, pieceId: "J", color: mColor });
          next.push({ r: mPart.r, c: mPart.c, pieceId: "J", color: mColor });
        }
        onChange(next);
        return;
      }
      return; // no partner slot available
    }

    if (pieceId) {
      next.push({ r, c, pieceId, color });
      if (mirror) {
        const m = mirrorOf({ r, c });
        next.push({ r: m.r, c: m.c, pieceId, color: color === "w" ? "b" : "w" });
      }
    }
    onChange(next);
  };

  const handleDrop = (e: React.DragEvent, sq: Square) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/x-piece");
    if (!data) return;
    const [pieceId, color] = data.split("|") as [PieceId, "w" | "b"];
    writeAt(sq.r, sq.c, pieceId, color);
    onSelectSquare(null);
  };

  const handleClick = (sq: Square) => {
    if (selectedSquare && selectedSquare.r === sq.r && selectedSquare.c === sq.c) {
      onSelectSquare(null);
    } else {
      onSelectSquare(sq);
    }
  };

  const rowOrder = Array.from({ length: rows }, (_, i) => rows - 1 - i);
  const colOrder = Array.from({ length: cols }, (_, i) => i);

  return (
    <div
      className="grid w-full max-w-[min(92vw,640px)] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-border"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        aspectRatio: `${cols} / ${rows}`,
      }}
    >
      {rowOrder.map((r) =>
        colOrder.map((c) => {
          const light = (r + c) % 2 === 1;
          const placement = grid[r][c];
          const def = placement ? (registry[placement.pieceId] ?? PIECE_LIBRARY[placement.pieceId]) : undefined;
          const isSelected = selectedSquare?.r === r && selectedSquare?.c === c;
          return (
            <div
              key={`${r}-${c}`}
              className={`relative flex items-center justify-center select-none cursor-pointer ${isSelected ? "ring-2 ring-inset ring-primary z-10" : ""}`}
              style={{ background: light ? "var(--color-board-light)" : "var(--color-board-dark)" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, { r, c })}
              onClick={() => handleClick({ r, c })}
            >
              {placement && def && (
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-piece", `${placement.pieceId}|${placement.color}`);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={(e) => {
                    if (e.dataTransfer.dropEffect === "none") writeAt(r, c, null, "w");
                  }}
                  className="flex items-center justify-center w-full h-full cursor-grab pointer-events-auto"
                >
                  <PieceGlyph
                    piece={{ id: placement.pieceId, color: placement.color }}
                    def={def}
                    className="text-[clamp(1.6rem,7vw,3.5rem)]"
                  />
                </span>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}
