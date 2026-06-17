import type { GameState, Move, Piece } from "@/game/types";
import { FILES } from "@/game/board";
import { PieceGlyph } from "./PieceGlyph";

function fileRank(c: number, r: number) { return `${FILES[c] ?? "?"}${r + 1}`; }

function notation(state: GameState, m: Move): string {
  const def = state.registry[m.piece.id];
  const letter = def?.special === "pawn" ? "" : m.piece.id;
  const to = fileRank(m.to.c, m.to.r);
  if (m.kind === "drop") return `${m.piece.id}@${to}`;
  if (m.kind === "dragonAttack") return `${letter}x${to}*`;
  if (!m.from) return `?${to}`;
  const from = fileRank(m.from.c, m.from.r);
  const sep = m.captured ? "x" : "-";
  const promo = m.promotion ? `=${m.promotion}` : "";
  const ep = m.kind === "ep" ? " e.p." : "";
  return `${letter}${from}${sep}${to}${promo}${ep}`;
}

export function MoveHistory({ state }: { state: GameState }) {
  const rows: { n: number; w?: Move; b?: Move }[] = [];
  state.history.forEach((m, i) => {
    const n = Math.floor(i / 2);
    if (i % 2 === 0) rows.push({ n: n + 1, w: m });
    else rows[rows.length - 1].b = m;
  });
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
        Moves
      </div>
      <div className="max-h-48 overflow-y-auto text-sm font-mono">
        {rows.length === 0 ? (
          <div className="px-3 py-4 text-muted-foreground text-center">No moves yet</div>
        ) : (
          rows.map((row) => (
            <div key={row.n} className="grid grid-cols-[2rem_1fr_1fr] gap-2 px-3 py-1 odd:bg-muted/40">
              <span className="text-muted-foreground">{row.n}.</span>
              <span>{row.w ? notation(state, row.w) : ""}</span>
              <span>{row.b ? notation(state, row.b) : ""}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function Captured({ state }: { state: GameState }) {
  const Row = ({ pieces, label }: { pieces: Piece[]; label: string }) => (
    <div className="flex items-center gap-2 min-h-8">
      <span className="text-xs text-muted-foreground w-16">{label}</span>
      <div className="flex flex-wrap gap-0.5 text-2xl leading-none">
        {pieces.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">—</span>
        ) : (
          pieces.map((p, i) => <PieceGlyph key={i} piece={p} def={state.registry[p.id]} className="text-2xl" />)
        )}
      </div>
    </div>
  );
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <Row label="White took" pieces={state.captured.w} />
      <Row label="Black took" pieces={state.captured.b} />
    </div>
  );
}
