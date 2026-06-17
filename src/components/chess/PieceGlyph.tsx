import type { Color, Piece, PieceDef } from "@/game/types";
import { NecromancerGlyph } from "./NecromancerGlyph";

interface Props {
  piece: Piece;
  def: PieceDef | undefined;
  className?: string;
}

export function PieceGlyph({ piece, def, className }: Props) {
  const glyph = def?.glyph ?? "?";
  const isWhite = piece.color === "w";

  // Necromancer needs visible eyes + teeth — render as a custom SVG so the
  // silhouette filter doesn't black out the interior features.
  const isNecro = piece.id === "M" || def?.special === "necromancer";

  // Unified approach: every piece is rendered as a silhouette in its side's
  // colour with a strong contrasting outline so it's unmistakable on any square.
  const filter = isWhite
    ? "brightness(0) saturate(100%) invert(1) drop-shadow(0 0 1.5px rgba(0,0,0,0.9)) drop-shadow(0 0 2.5px rgba(0,0,0,0.7)) drop-shadow(0 0 4px rgba(0,0,0,0.4))"
    : "brightness(0) drop-shadow(0 0 1.5px rgba(255,255,255,0.95)) drop-shadow(0 0 2.5px rgba(255,255,255,0.7)) drop-shadow(0 0 4px rgba(255,255,255,0.4))";

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      style={{ lineHeight: 1, userSelect: "none" }}
    >
      {isNecro ? (
        <NecromancerGlyph color={piece.color} />
      ) : (
        <span className="relative" style={{ filter }}>
          {glyph}
        </span>
      )}
    </span>
  );
}

/** Helper for palettes / dialogs where we just have an id + color. */
export function PieceById({
  id, color, def, className,
}: { id: string; color: Color; def: PieceDef | undefined; className?: string }) {
  return <PieceGlyph piece={{ id, color }} def={def} className={className} />;
}
