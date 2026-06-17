import type { Color } from "@/game/types";

/**
 * Necromancer skull. Rendered as an SVG so eye sockets and teeth are
 * clearly visible regardless of side colour (the silhouette-filter trick
 * used for emoji glyphs blacked out all the interior features).
 *
 * White side  = predominantly white skull with black outlines/details.
 * Black side  = predominantly black skull with white outlines/details.
 */
export function NecromancerGlyph({ color }: { color: Color }) {
  const isWhite = color === "w";
  const fill = isWhite ? "#f5f1e6" : "#0e0e10";
  const detail = isWhite ? "#0b0b0d" : "#f5f1e6";
  const stroke = detail;
  return (
    <svg
      viewBox="0 0 64 64"
      width="80%"
      height="80%"
      style={{
        filter: isWhite
          ? "drop-shadow(0 1px 1px rgba(0,0,0,0.45))"
          : "drop-shadow(0 1px 1px rgba(255,255,255,0.35))",
      }}
      aria-hidden
    >
      {/* Cranium */}
      <path
        d="M32 4c-12 0-21 8.5-21 20 0 7 3 12 6 15v7c0 2 1.5 3.5 3.5 3.5H22v4c0 1.5 1.2 2.5 2.5 2.5h2v3.5c0 .8.7 1.5 1.5 1.5h2c.8 0 1.5-.7 1.5-1.5V56h1v3.5c0 .8.7 1.5 1.5 1.5h2c.8 0 1.5-.7 1.5-1.5V56h2c1.3 0 2.5-1 2.5-2.5v-4h1.5c2 0 3.5-1.5 3.5-3.5v-7c3-3 6-8 6-15C53 12.5 44 4 32 4z"
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Eye sockets */}
      <ellipse cx={22} cy={28} rx={5.5} ry={6.5} fill={detail} />
      <ellipse cx={42} cy={28} rx={5.5} ry={6.5} fill={detail} />
      {/* Nasal cavity */}
      <path d="M32 36l-2.5 6h5L32 36z" fill={detail} />
      {/* Teeth — vertical separators */}
      <g stroke={detail} strokeWidth={1.6} strokeLinecap="round">
        <line x1={26} y1={49} x2={26} y2={56} />
        <line x1={30} y1={49} x2={30} y2={56.5} />
        <line x1={34} y1={49} x2={34} y2={56.5} />
        <line x1={38} y1={49} x2={38} y2={56} />
        {/* Top jaw line */}
        <line x1={23} y1={49} x2={41} y2={49} />
      </g>
    </svg>
  );
}
