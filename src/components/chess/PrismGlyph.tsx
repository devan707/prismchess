/** Rainbow triangular-prism glyph. Color-agnostic (fixture, not a player piece). */
export function PrismGlyph({ size = 1 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={`${size * 100}%`}
      height={`${size * 100}%`}
      style={{ display: "block", filter: "drop-shadow(0 0 2px rgba(0,0,0,0.55)) drop-shadow(0 0 4px rgba(255,255,255,0.35))" }}
      aria-hidden
    >
      <defs>
        <linearGradient id="prismRainbow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#ff3b3b" />
          <stop offset="20%"  stopColor="#ff9f1c" />
          <stop offset="40%"  stopColor="#ffe14d" />
          <stop offset="60%"  stopColor="#4ade80" />
          <stop offset="80%"  stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id="prismFace" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.85)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.15)" />
        </linearGradient>
      </defs>
      {/* Triangular prism viewed end-on: outer triangle with rainbow fill,
          inner face highlight to suggest 3D refraction. */}
      <polygon
        points="50,12 88,82 12,82"
        fill="url(#prismRainbow)"
        stroke="rgba(0,0,0,0.6)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <polygon
        points="50,22 78,76 22,76"
        fill="url(#prismFace)"
        opacity="0.55"
      />
      {/* Inner refraction line */}
      <line x1="50" y1="22" x2="50" y2="76" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
    </svg>
  );
}
