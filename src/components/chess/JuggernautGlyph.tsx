import type { Color } from "@/game/types";

interface Props {
  color: Color;
  /** "horizontal" = pair spans two columns; "vertical" = pair spans two rows. */
  orientation: "horizontal" | "vertical";
  /** Direction this juggernaut faces (rendering a chevron on the front). */
  facing: "up" | "down" | "left" | "right";
}

/**
 * A 2-square-wide siege engine. Renders inside a single grid cell but
 * absolutely overflows into the partner cell so the whole piece is one
 * continuous symbol. The host cell must be the "lead" half (lower r or c).
 */
export function JuggernautGlyph({ color, orientation, facing }: Props) {
  const horizontal = orientation === "horizontal";
  const body = color === "w" ? "oklch(0.86 0.03 85)" : "oklch(0.22 0.02 220)";
  const trim = color === "w" ? "oklch(0.55 0.05 85)" : "oklch(0.08 0.01 220)";
  const accent = color === "w" ? "oklch(0.45 0.06 30)" : "oklch(0.78 0.12 30)";
  const stroke = color === "w" ? "oklch(0.3 0.02 220 / 0.7)" : "oklch(0 0 0 / 0.6)";

  // Wrapper spans 2 cells along the orientation axis.
  const wrapperStyle: React.CSSProperties = horizontal
    ? { position: "absolute", top: "8%", bottom: "8%", left: "8%", width: "184%" }
    : { position: "absolute", left: "8%", right: "8%", top: "8%", height: "184%" };

  // SVG viewBox: 2:1 along the long axis.
  const vbW = horizontal ? 200 : 100;
  const vbH = horizontal ? 100 : 200;

  // Chevron points based on facing.
  const chev = (() => {
    const m = 10; // margin from edge
    switch (facing) {
      case "right":
        return `${vbW - m},${vbH / 2} ${vbW - m - 22},${vbH / 2 - 18} ${vbW - m - 22},${vbH / 2 + 18}`;
      case "left":
        return `${m},${vbH / 2} ${m + 22},${vbH / 2 - 18} ${m + 22},${vbH / 2 + 18}`;
      case "down":
        return `${vbW / 2},${vbH - m} ${vbW / 2 - 18},${vbH - m - 22} ${vbW / 2 + 18},${vbH - m - 22}`;
      case "up":
      default:
        return `${vbW / 2},${m} ${vbW / 2 - 18},${m + 22} ${vbW / 2 + 18},${m + 22}`;
    }
  })();

  // Rivets along the long sides for a siege-engine feel.
  const rivets: { cx: number; cy: number }[] = [];
  if (horizontal) {
    for (let i = 0; i < 6; i++) {
      const x = 20 + i * 32;
      rivets.push({ cx: x, cy: 14 });
      rivets.push({ cx: x, cy: vbH - 14 });
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const y = 20 + i * 32;
      rivets.push({ cx: 14, cy: y });
      rivets.push({ cx: vbW - 14, cy: y });
    }
  }

  return (
    <div style={{ ...wrapperStyle, pointerEvents: "none", zIndex: 5 }} aria-hidden>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        style={{ filter: "drop-shadow(0 2px 3px oklch(0 0 0 / 0.45))" }}
      >
        {/* Hull */}
        <rect
          x={4}
          y={4}
          width={vbW - 8}
          height={vbH - 8}
          rx={horizontal ? 18 : 18}
          ry={horizontal ? 18 : 18}
          fill={body}
          stroke={stroke}
          strokeWidth={4}
        />
        {/* Inner plating divider down the middle of the long axis */}
        {horizontal ? (
          <line x1={vbW / 2} y1={10} x2={vbW / 2} y2={vbH - 10} stroke={trim} strokeWidth={3} strokeDasharray="6 4" />
        ) : (
          <line x1={10} y1={vbH / 2} x2={vbW - 10} y2={vbH / 2} stroke={trim} strokeWidth={3} strokeDasharray="6 4" />
        )}
        {/* Rivets */}
        {rivets.map((r, i) => (
          <circle key={i} cx={r.cx} cy={r.cy} r={3} fill={trim} />
        ))}
        {/* Front chevron / ram */}
        <polygon points={chev} fill={accent} stroke={stroke} strokeWidth={2} />
      </svg>
    </div>
  );
}
