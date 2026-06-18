import type { Color, GameState } from "@/game/types";
import { materialDiff } from "@/game/pieceValue";

interface Props {
  state: GameState;
  humanColor: Color;
  className?: string;
}

/**
 * Compact "+4" / "−3" badge showing material differential from the human's
 * perspective. Hidden entirely when the score is even. Royals and the
 * indestructible Prism are excluded from the calculation.
 */
export function MaterialBadge({ state, humanColor, className }: Props) {
  const diff = materialDiff(state, humanColor);
  if (diff === 0) return null;
  const positive = diff > 0;
  const label = `${positive ? "+" : "−"}${Math.abs(diff)}`;
  const cls = positive
    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
    : "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  return (
    <span
      className={`inline-flex items-center font-mono font-semibold text-[11px] leading-none px-1.5 py-1 rounded-md ring-1 tabular-nums ${cls} ${className ?? ""}`}
      title={positive ? "You are ahead in material" : "You are behind in material"}
    >
      {label}
    </span>
  );
}
