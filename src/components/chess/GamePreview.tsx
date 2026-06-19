import { useMemo } from "react";
import type { Design, PieceDef } from "@/game/types";
import { buildRegistry } from "@/game/pieces";
import { PieceById } from "./PieceGlyph";

interface Props {
  design: Design;
  /** Limit the rendered board's max width (px). */
  maxBoardPx?: number;
}

/**
 * Static, non-interactive preview of a variant: the starting position and a
 * list of unique pieces in play. Cheap to render — no game state, no move
 * generation. Used on game detail pages so visitors can see what they're
 * about to play.
 */
export function GamePreview({ design, maxBoardPx = 320 }: Props) {
  const registry = useMemo(
    () => buildRegistry(design.customPieces ?? []),
    [design.customPieces],
  );

  // Map placements by `${r},${c}` for O(1) lookup.
  const byCell = useMemo(() => {
    const m = new Map<string, { pieceId: string; color: "w" | "b" }>();
    for (const p of design.placements ?? []) {
      m.set(`${p.r},${p.c}`, { pieceId: p.pieceId, color: p.color });
    }
    return m;
  }, [design.placements]);

  // Unique pieces present on the board OR in starting reserves.
  const uniquePieces = useMemo(() => {
    const ids = new Set<string>();
    for (const p of design.placements ?? []) ids.add(p.pieceId);
    for (const side of ["w", "b"] as const) {
      const r = design.reserves?.[side];
      if (r) for (const k of Object.keys(r)) if ((r as Record<string, number>)[k] > 0) ids.add(k);
    }
    const out: { id: string; def: PieceDef | undefined }[] = [];
    for (const id of Array.from(ids)) out.push({ id, def: registry[id] });
    out.sort((a, b) => (b.def?.worth ?? 0) - (a.def?.worth ?? 0));
    return out;
  }, [design.placements, design.reserves, registry]);

  const rows = design.rows;
  const cols = design.cols;

  return (
    <div className="space-y-3">
      <div
        className="mx-auto rounded-md overflow-hidden border bg-card shadow-sm"
        style={{ maxWidth: maxBoardPx }}
      >
        <div
          className="grid w-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            aspectRatio: `${cols} / ${rows}`,
          }}
        >
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => {
              const cell = byCell.get(`${r},${c}`);
              const dark = (r + c) % 2 === 1;
              return (
                <div
                  key={`${r}-${c}`}
                  className={`flex items-center justify-center ${dark ? "bg-stone-400/40 dark:bg-stone-700/60" : "bg-stone-200/40 dark:bg-stone-800/40"}`}
                >
                  {cell && (
                    <PieceById
                      id={cell.pieceId}
                      color={cell.color}
                      def={registry[cell.pieceId]}
                      className="text-[min(4.5vw,1.6rem)] leading-none"
                    />
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
          Pieces in play · {rows}×{cols}
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {uniquePieces.map(({ id, def }) => (
            <li
              key={id}
              className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs"
              title={def?.description ?? def?.name ?? id}
            >
              <PieceById id={id} color="w" def={def} className="text-lg leading-none" />
              <span className="font-medium">{def?.name ?? id}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
