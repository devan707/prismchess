import type { PieceDef, PieceId } from "@/game/types";
import { getPiecePoints } from "@/game/pieceValue";

interface Props {
  id: PieceId;
  def?: PieceDef;
  className?: string;
}

/**
 * Inline badge: "Worth 5 pts" — shown next to piece names/descriptions
 * to surface relative strength.
 */
export function PieceWorthBadge({ id, def, className }: Props) {
  if (def?.royal) {
    return (
      <span
        className={`inline-flex items-center font-mono text-[10px] leading-none px-1.5 py-0.5 rounded-md ring-1 ring-amber-500/40 bg-amber-500/10 text-amber-300 tabular-nums ${className ?? ""}`}
        title="Royal piece — loss ends the game"
      >
        Royal
      </span>
    );
  }
  const pts = getPiecePoints(id, def);
  if (pts <= 0) return null;
  const display = Number.isInteger(pts) ? pts : pts.toFixed(1);
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] leading-none px-1.5 py-0.5 rounded-md ring-1 ring-sky-500/40 bg-sky-500/10 text-sky-300 tabular-nums ${className ?? ""}`}
      title="Point value (P=1, N/B=3, R=5, Q=9)"
    >
      Worth {display} {pts === 1 ? "pt" : "pts"}
    </span>
  );
}
