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
    // Render emoji as a high-contrast silhouette so dark pieces clearly look
    // dark and white pieces clearly look white. A circular backing in the
    // piece's own color holds the silhouetted icon.
    const isWhite = piece.color === "w";
    const bg = isWhite
      ? "oklch(0.97 0.012 85)"   // ivory
      : "oklch(0.18 0.02 220)";  // slate-black
    const ring = isWhite
      ? "oklch(0.55 0.04 85 / 0.55)"
      : "oklch(0 0 0 / 0.7)";
    const shadow = isWhite
      ? "0 1px 2px oklch(0.2 0.02 220 / 0.55)"
      : "0 1px 2px oklch(0 0 0 / 0.7)";
    // Silhouette: any emoji collapsed to pure black or pure white.
    const silhouetteFilter = isWhite
      ? "brightness(0) opacity(0.88)"               // dark silhouette on ivory
      : "brightness(0) invert(1) opacity(0.96)";    // white silhouette on slate
    return (
      <span
        className={`relative inline-flex items-center justify-center ${className ?? ""}`}
        style={{ lineHeight: 1, userSelect: "none" }}
      >
        <span
          aria-hidden
          className="absolute inset-[8%] rounded-full"
          style={{
            background: bg,
            boxShadow: `${shadow}, inset 0 0 0 1.5px ${ring}`,
          }}
        />
        <span
          className={`relative ${sizeClassName ?? "text-[0.72em]"}`}
          style={{ filter: silhouetteFilter }}
        >
          {glyph}
        </span>
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
