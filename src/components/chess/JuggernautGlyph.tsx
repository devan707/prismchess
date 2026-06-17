import type { Color } from "@/game/types";

interface Props {
  color: Color;
  /** "horizontal" = pair spans two columns; "vertical" = pair spans two rows. */
  orientation: "horizontal" | "vertical";
  /** Direction the titan faces (its "front" / helmet points here). */
  facing: "up" | "down" | "left" | "right";
}

/**
 * Top-down silhouette of a massive armored titan that occupies two adjacent
 * squares. Rendered inside the "lead" cell but overflows into the partner
 * cell so the whole figure reads as one continuous piece. The titan is
 * always mirrored to face the opponent.
 */
export function JuggernautGlyph({ color, orientation, facing }: Props) {
  const horizontal = orientation === "horizontal";

  // Wrapper spans 2 cells along the orientation axis.
  const wrapperStyle: React.CSSProperties = horizontal
    ? { position: "absolute", top: "4%", bottom: "4%", left: "4%", width: "192%" }
    : { position: "absolute", left: "4%", right: "4%", top: "4%", height: "192%" };

  const vbW = horizontal ? 200 : 100;
  const vbH = horizontal ? 100 : 200;

  // The base drawing is laid out as 200×100 with the titan's HEAD/front at y=0
  // (top), arms spanning left↔right. We transform it to honor `facing` so the
  // titan always points at the enemy edge.
  let transform = "";
  if (horizontal) {
    if (facing === "down") transform = "translate(200,100) rotate(180)";
  } else {
    if (facing === "right") transform = "translate(0,200) rotate(-90)";
    else /* left */ transform = "translate(100,0) rotate(90)";
  }

  // High-contrast B/W aesthetic matching the rest of the piece set.
  const fill = color === "w" ? "oklch(0.96 0.01 85)" : "oklch(0.12 0 0)";
  const line = color === "w" ? "oklch(0.18 0 0)" : "oklch(0.94 0.02 85)";
  const accent = color === "w" ? "oklch(0.32 0.03 30)" : "oklch(0.78 0.05 30)";

  return (
    <div style={{ ...wrapperStyle, pointerEvents: "none", zIndex: 5 }} aria-hidden>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ filter: "drop-shadow(0 2px 3px oklch(0 0 0 / 0.5))" }}
      >
        <g transform={transform}>
          {/* Drawing canvas: 200 wide × 100 tall, head/front at top (y small). */}

          {/* ── BODY (silhouette) ───────────────────────────────────────── */}
          {/* Single big union path: shoulders + torso + boots so the
              silhouette reads as one mass at small sizes. */}
          <path
            d="
              M 100 6
              C 108 6  114 10  116 18
              C 132 18 150 24  170 32
              C 188 38 196 46  196 56
              C 196 66 186 72  170 74
              C 156 76 142 76  130 76
              L 130 82
              C 138 86  142 92  140 96
              L 116 96
              C 114 92  112 88  110 84
              L 90 84
              C 88 88  86 92  84 96
              L 60 96
              C 58 92  62 86  70 82
              L 70 76
              C 58 76  44 76  30 74
              C 14 72  4 66   4 56
              C 4 46   12 38  30 32
              C 50 24  68 18  84 18
              C 86 10  92 6  100 6
              Z"
            fill={fill}
            stroke={line}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />

          {/* ── HELMET CREST (forward spike) ────────────────────────────── */}
          <path
            d="M 100 0 L 106 16 L 100 14 L 94 16 Z"
            fill={fill}
            stroke={line}
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* ── HELMET FACE PLATE (T-slit visor) ────────────────────────── */}
          <path
            d="M 92 16 L 108 16 L 106 22 L 102 24 L 102 30 L 98 30 L 98 24 L 94 22 Z"
            fill={line}
            opacity={0.9}
          />

          {/* ── SHOULDER PLATING SEAMS ─────────────────────────────────── */}
          <path
            d="M 30 40 Q 50 36 70 38"
            fill="none"
            stroke={line}
            strokeWidth={1.6}
            opacity={0.55}
          />
          <path
            d="M 170 40 Q 150 36 130 38"
            fill="none"
            stroke={line}
            strokeWidth={1.6}
            opacity={0.55}
          />
          <path
            d="M 22 56 Q 50 52 78 56"
            fill="none"
            stroke={line}
            strokeWidth={1.6}
            opacity={0.45}
          />
          <path
            d="M 178 56 Q 150 52 122 56"
            fill="none"
            stroke={line}
            strokeWidth={1.6}
            opacity={0.45}
          />

          {/* ── CHEST PLATE divider down the spine ─────────────────────── */}
          <line
            x1={100} y1={26} x2={100} y2={78}
            stroke={line}
            strokeWidth={1.4}
            opacity={0.55}
          />

          {/* ── CHEST EMBLEM (diamond) ─────────────────────────────────── */}
          <path
            d="M 100 56 L 106 64 L 100 72 L 94 64 Z"
            fill={accent}
            stroke={line}
            strokeWidth={1.4}
          />

          {/* ── ARMOR RIVETS along the pauldrons ───────────────────────── */}
          {[28, 44, 60, 140, 156, 172].map((x) => (
            <circle key={`rv-${x}`} cx={x} cy={48} r={1.6} fill={line} opacity={0.7} />
          ))}
        </g>
      </svg>
    </div>
  );
}
