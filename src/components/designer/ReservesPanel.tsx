import type { Color, GameState, PieceId } from "@/game/types";
import { PieceById } from "@/components/chess/PieceGlyph";

interface Props {
  state: GameState;
  color: Color;
  selectedDrop: PieceId | null;
  onSelectDrop: (id: PieceId | null) => void;
  disabled?: boolean;
}

export function ReservesPanel({ state, color, selectedDrop, onSelectDrop, disabled }: Props) {
  const reserves = state.reserves[color];
  const entries = Object.entries(reserves).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-lg border bg-card p-2 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">{color === "w" ? "White" : "Black"} reserves:</span>
      {entries.map(([id, n]) => {
        const def = state.registry[id];
        if (!def) return null;
        const selected = selectedDrop === id;
        return (
          <button
            key={id}
            disabled={disabled}
            className={`relative flex items-center gap-1 px-2 py-1 rounded-md border text-xs ${selected ? "ring-2 ring-primary bg-accent/40" : "bg-background hover:bg-accent/30"} disabled:opacity-50`}
            onClick={() => onSelectDrop(selected ? null : id)}
          >
            <PieceById id={id} color={color} def={def} className="text-xl" />
            <span className="font-mono">×{n}</span>
          </button>
        );
      })}
      {selectedDrop && (
        <span className="text-[11px] text-muted-foreground">Click an empty square to drop.</span>
      )}
    </div>
  );
}
