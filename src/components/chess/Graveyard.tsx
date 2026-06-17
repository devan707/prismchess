import type { Color, GameState, Piece, PieceId } from "@/game/types";
import { PieceGlyph } from "./PieceGlyph";

interface Props {
  state: GameState;
  humanColor: Color;
  /** If set, the human's necromancer is selected — clicking a fallen friendly
   *  piece picks it as the resurrection target. */
  resurrectMode?: boolean;
  resurrectChoice?: PieceId | null;
  onPickResurrect?: (pieceId: PieceId | null) => void;
}

export function Graveyard({
  state,
  humanColor,
  resurrectMode,
  resurrectChoice,
  onPickResurrect,
}: Props) {
  const opp: Color = humanColor === "w" ? "b" : "w";
  // Captured pieces of color X live in state.captured[opposite of X].
  // i.e. pieces lost by white (= captured BY black) are in state.captured.b.
  const humansFallen = state.captured[opp];   // your dead — what necromancer can resurrect
  const oppFallen = state.captured[humanColor]; // their dead

  return (
    <div className="w-full max-w-[min(92vw,640px)] rounded-lg border bg-card/80 backdrop-blur-sm p-2 shadow-sm">
      <Row
        label="Opponent's graveyard"
        color={opp}
        pieces={oppFallen}
        state={state}
      />
      <div className="h-px bg-border my-1" />
      <Row
        label={resurrectMode ? "Pick a fallen piece to resurrect" : "Your graveyard"}
        color={humanColor}
        pieces={humansFallen}
        state={state}
        clickable={resurrectMode}
        choice={resurrectChoice ?? null}
        onPick={onPickResurrect}
        highlight={resurrectMode}
      />
    </div>
  );
}

function Row({
  label,
  color,
  pieces,
  state,
  clickable,
  choice,
  onPick,
  highlight,
}: {
  label: string;
  color: Color;
  pieces: Piece[];
  state: GameState;
  clickable?: boolean;
  choice?: PieceId | null;
  onPick?: (id: PieceId | null) => void;
  highlight?: boolean;
}) {
  // Group by piece id with count.
  const groups = new Map<PieceId, number>();
  for (const p of pieces) groups.set(p.id, (groups.get(p.id) ?? 0) + 1);
  const ids = Array.from(groups.keys());

  return (
    <div className="flex items-center gap-2 min-h-9">
      <span
        className={`text-[10px] uppercase tracking-wide w-20 shrink-0 ${
          highlight ? "text-primary font-semibold" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1 flex-1">
        {ids.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">
            {clickable ? "— no fallen pieces yet —" : "— none —"}
          </span>
        ) : (
          ids.map((id) => {
            const def = state.registry[id];
            const count = groups.get(id)!;
            const selected = clickable && choice === id;
            // Juggernauts and barricades cannot be resurrected.
            const unresurrectable =
              !!clickable && (def?.special === "juggernaut" || !!def?.immobile);
            const enabled = clickable && !unresurrectable;
            return (
              <button
                key={id}
                type="button"
                disabled={!enabled}
                onClick={() => onPick?.(selected ? null : id)}
                className={`relative inline-flex items-center justify-center rounded-md transition-colors ${
                  enabled ? "cursor-pointer hover:bg-accent" : "cursor-default"
                } ${
                  selected
                    ? "ring-2 ring-primary bg-accent"
                    : enabled
                    ? "ring-1 ring-border"
                    : ""
                } ${unresurrectable ? "opacity-40" : ""}`}
                style={{ width: "2rem", height: "2rem" }}
                aria-label={`${def?.name ?? id}${count > 1 ? ` ×${count}` : ""}${unresurrectable ? " (cannot be resurrected)" : ""}`}
                title={unresurrectable ? `${def?.name ?? id} — cannot be resurrected` : def?.name ?? id}
              >
                <PieceGlyph
                  piece={{ id, color }}
                  def={def}
                  className="text-[1.4rem]"
                />
                {count > 1 && (
                  <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-background border rounded-full px-1 leading-tight">
                    {count}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
