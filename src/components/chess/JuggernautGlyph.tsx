import type { Color } from "@/game/types";
import juggernautArt from "@/assets/juggernaut-top.png";

interface Props {
  color: Color;
  /** "horizontal" = pair spans two columns; "vertical" = pair spans two rows. */
  orientation: "horizontal" | "vertical";
  /** Direction the titan faces (its helmet crest points here). */
  facing: "up" | "down" | "left" | "right";
}

/**
 * Top-down armored colossus glyph. Spans two adjacent cells via absolute
 * overflow from the "lead" cell. The artwork's natural orientation has the
 * crest pointing UP in a horizontal (2-wide) frame; we rotate/flip per
 * `facing` so the titan always points at the enemy. White pieces invert
 * the silhouette to the cream/dark scheme that matches the rest of the set.
 */
export function JuggernautGlyph({ color, orientation, facing }: Props) {
  const horizontal = orientation === "horizontal";

  // Wrapper spans 2 cells along the orientation axis.
  const wrapperStyle: React.CSSProperties = horizontal
    ? { position: "absolute", top: "2%", bottom: "2%", left: "2%", width: "196%" }
    : { position: "absolute", left: "2%", right: "2%", top: "2%", height: "196%" };

  // The art is laid out horizontally (2:1, crest up). Rotate to match facing.
  let rotation = 0;
  if (horizontal) {
    rotation = facing === "down" ? 180 : 0;
  } else {
    rotation = facing === "left" ? 90 : -90;
  }

  // White piece = inverted silhouette (cream body with dark trim).
  const invertFilter = color === "w" ? "invert(1) hue-rotate(180deg)" : "none";

  return (
    <div style={{ ...wrapperStyle, pointerEvents: "none", zIndex: 5 }} aria-hidden>
      <img
        src={juggernautArt}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "center",
          filter: `${invertFilter} drop-shadow(0 2px 3px rgba(0,0,0,0.5))`,
        }}
      />
    </div>
  );
}
