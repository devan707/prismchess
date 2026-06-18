import type { Color, GameState, Piece, PieceId } from "@/game/types";
import { PieceGlyph } from "./PieceGlyph";
import { MaterialBadge } from "./MaterialBadge";

interface Props {
  state: GameState;
  humanColor: Color;
}

/** Plain display of fallen pieces on each side. Resurrection is no longer
 *  picked from the graveyard — select the Necromancer to enter Spirit View
 *  on the board, then click a ghost on an adjacent square to raise it. */
export function Graveyard({ state, humanColor }: Props) {
  const opp: Color = humanColor === "w" ? "b" : "w";
  const humansFallen = state.captured[opp];
  const oppFallen = state.captured[humanColor];

  return (
    <div className="w-full max-w-[min(92vw,640px)] rounded-lg border bg-card/80 backdrop-blur-sm p-2 shadow-sm">
      <div className="flex items-center justify-end mb-1">
        <MaterialBadge state={state} humanColor={humanColor} />
      </div>
      <Row label="Opponent's graveyard" color={opp} pieces={oppFallen} state={state} />
      <div className="h-px bg-border my-1" />
      <Row label="Your graveyard" color={humanColor} pieces={humansFallen} state={state} />
    </div>
  );
}

function Row({
  label,
  color,
  pieces,
  state,
}: {
  label: string;
  color: Color;
  pieces: Piece[];
  state: GameState;
}) {
  const groups = new Map<PieceId, number>();
  for (const p of pieces) groups.set(p.id, (groups.get(p.id) ?? 0) + 1);
  const ids = Array.from(groups.keys());

  return (
    <div className="flex items-center gap-2 min-h-9">
      <span className="text-[10px] uppercase tracking-wide w-20 shrink-0 text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1 flex-1">
        {ids.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">— none —</span>
        ) : (
          ids.map((id) => {
            const def = state.registry[id];
            const count = groups.get(id)!;
            return (
              <span
                key={id}
                className="relative inline-flex items-center justify-center rounded-md ring-1 ring-border"
                style={{ width: "2rem", height: "2rem" }}
                title={def?.name ?? id}
              >
                <PieceGlyph piece={{ id, color }} def={def} className="text-[1.4rem]" />
                {count > 1 && (
                  <span className="absolute -bottom-1 -right-1 text-[9px] font-bold bg-background border rounded-full px-1 leading-tight">
                    {count}
                  </span>
                )}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
