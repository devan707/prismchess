import type { Piece } from "@/game/types";

// Unicode chess glyphs
const GLYPHS: Record<string, string> = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

export function PieceGlyph({ piece, className }: { piece: Piece; className?: string }) {
  const g = GLYPHS[piece.color + piece.type];
  return (
    <span
      className={className}
      style={{
        color: piece.color === "w" ? "oklch(0.99 0.01 85)" : "oklch(0.15 0.02 220)",
        textShadow:
          piece.color === "w"
            ? "0 1px 0 oklch(0.2 0.02 220), 0 0 2px oklch(0.2 0.02 220 / 0.6)"
            : "0 1px 0 oklch(0.95 0.01 85 / 0.4)",
        lineHeight: 1,
        userSelect: "none",
      }}
    >
      {g}
    </span>
  );
}
