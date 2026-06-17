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
    const filtered = design.placements.filter((p) => !(p.r === r && p.c === c));
    const mirrored = mirror
      ? wide
        ? filtered.filter((p) => !(p.r === r && p.c === cols - 1 - c))
        : filtered.filter((p) => !(p.r === rows - 1 - r && p.c === c))
      : filtered;
    const next: Placement[] = mirrored;
    if (pieceId) next.push({ r, c, pieceId, color });
    if (mirror && pieceId) {
      const mColor: "w" | "b" = color === "w" ? "b" : "w";
      if (wide) {
        next.push({ r, c: cols - 1 - c, pieceId, color: mColor });
      } else {
        next.push({ r: rows - 1 - r, c, pieceId, color: mColor });
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
                    className="text-[clamp(1.6rem,7vw,3.5rem)] drop-shadow"
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
