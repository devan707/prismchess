import type { Color, Piece, PieceDef } from "@/game/types";
import { NecromancerGlyph } from "./NecromancerGlyph";
import { PrismGlyph } from "./PrismGlyph";
import juggernautArt from "@/assets/juggernaut-top.png";

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
  // Prism is a rainbow fixture — render as a custom SVG (no silhouette filter,
  // color-agnostic) so its refractive look reads on any square.
  const isPrism = def?.special === "prism";
  // Juggernaut: on the live board it spans 2 cells via a dedicated overlay
  // (Board.tsx). Everywhere else — sandbox palette, designer board,
  // promotion dialog, graveyard — render the same artwork in a single cell
  // so the silhouette stays consistent instead of falling back to 🛡️.
  const isJuggernaut = def?.special === "juggernaut";

  // Unified approach: every piece is rendered as a silhouette in its side's
  // colour with a strong contrasting outline so it's unmistakable on any square.
  const filter = isWhite
    ? "brightness(0) saturate(100%) invert(1) drop-shadow(0 0 1.5px rgba(0,0,0,0.9)) drop-shadow(0 0 2.5px rgba(0,0,0,0.7)) drop-shadow(0 0 4px rgba(0,0,0,0.4))"
    : "brightness(0) drop-shadow(0 0 1.5px rgba(255,255,255,0.95)) drop-shadow(0 0 2.5px rgba(255,255,255,0.7)) drop-shadow(0 0 4px rgba(255,255,255,0.4))";

  // Undead overlay: faint green glow + tinted halo behind the silhouette so
  // the piece is unmistakably "raised by a Necromancer".
  const undead = !!piece.undead;

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      style={{ lineHeight: 1, userSelect: "none" }}
    >
      {undead && (
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(74,222,128,0.55) 0%, rgba(74,222,128,0.18) 45%, transparent 70%)",
            filter: "blur(2px)",
          }}
        />
      )}
      {isNecro ? (
        <NecromancerGlyph color={piece.color} />
      ) : isPrism ? (
        <PrismGlyph />
      ) : isJuggernaut ? (
        <img
          src={juggernautArt}
          alt=""
          draggable={false}
          style={{
            width: "115%",
            height: "115%",
            objectFit: "contain",
            filter: `${piece.color === "w" ? "invert(1) hue-rotate(180deg)" : "none"} drop-shadow(0 0 1px rgba(0,0,0,0.9)) drop-shadow(0 0 2px rgba(0,0,0,0.7)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))`,
          }}
        />
      ) : (
        <span
          className="relative"
          style={{
            filter: undead
              ? `${filter} drop-shadow(0 0 4px rgba(74,222,128,0.95)) drop-shadow(0 0 8px rgba(34,197,94,0.7))`
              : filter,
          }}
        >
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
