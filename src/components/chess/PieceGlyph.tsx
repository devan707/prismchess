import type { Color, Piece, PieceDef } from "@/game/types";

interface Props {
  piece: Piece;
  def: PieceDef | undefined;
  className?: string;
  /** Override size class. */
  sizeClassName?: string;
}

export function PieceGlyph({ piece, def, className, sizeClassName }: Props) {
  const glyph = def?.glyph ?? "?";
  const emoji = def?.emoji;
  if (emoji) {
    return (
      <span
        className={`relative inline-flex items-center justify-center ${className ?? ""}`}
        style={{ lineHeight: 1, userSelect: "none" }}
      >
        <span
          aria-hidden
          className="absolute inset-[10%] rounded-full"
          style={{
            background: piece.color === "w" ? "oklch(0.99 0.01 85 / 0.85)" : "oklch(0.15 0.02 220 / 0.85)",
            boxShadow: piece.color === "w"
              ? "0 1px 2px oklch(0.2 0.02 220 / 0.5)"
              : "0 1px 2px oklch(0 0 0 / 0.6)",
          }}
        />
        <span className={`relative ${sizeClassName ?? "text-[0.75em]"}`}>{glyph}</span>
      </span>
    );
  }
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
      {glyph}
    </span>
  );
}

/** Helper for palettes / dialogs where we just have an id + color. */
export function PieceById({
  id, color, def, className, sizeClassName,
}: { id: string; color: Color; def: PieceDef | undefined; className?: string; sizeClassName?: string }) {
  return <PieceGlyph piece={{ id, color }} def={def} className={className} sizeClassName={sizeClassName} />;
}
