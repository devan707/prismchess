import { useEffect, useState } from "react";
import type { GameState, PieceId, Square } from "@/game/types";
import { PieceGlyph } from "./PieceGlyph";
import { JuggernautGlyph } from "./JuggernautGlyph";
import { findRoyals } from "@/game/board";
import { inCheck } from "@/game/moves";

interface BoardProps {
  state: GameState;
  humanColor: "w" | "b";
  flipped: boolean;
  legalFor: (sq: Square | null) => Square[];
  onMove: (from: Square, to: Square) => boolean;
  /** Currently-selected drop piece (renders legal-drop indicators). */
  dropPiece?: PieceId | null;
  dropTargets?: Square[];
  onDrop?: (pieceId: PieceId, to: Square) => boolean;
  disabled?: boolean;
  /** Notified whenever the on-board selection changes (or clears). */
  onSelectionChange?: (sq: Square | null) => void;
}

export function Board({ state, humanColor, flipped, legalFor, onMove, dropPiece, dropTargets, onDrop, disabled, onSelectionChange }: BoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [dragFrom, setDragFrom] = useState<Square | null>(null);

  useEffect(() => { onSelectionChange?.(selected); }, [selected, onSelectionChange]);


  const rows = state.board.length;
  const cols = state.board[0]?.length ?? 0;
  const legalTargets = legalFor(selected ?? dragFrom);
  const last = state.history[state.history.length - 1];

  const checkColor = inCheck(state, state.turn) ? state.turn : null;
  const checkSquares = checkColor ? findRoyals(state, checkColor) : [];

  // Spirit View: when the human's Necromancer is selected, expose a map of
  // corpses keyed by "r,c" → most-recent corpse to render as a ghost overlay.
  const selectedPiece = selected ? state.board[selected.r][selected.c] : null;
  const selectedDef = selectedPiece ? state.registry[selectedPiece.id] : null;
  const necromancerSelected =
    !!selectedPiece &&
    selectedPiece.color === humanColor &&
    selectedDef?.special === "necromancer";
  const ghostMap = new Map<string, { id: string; color: "w" | "b"; originalOwner: "w" | "b" }>();
  if (necromancerSelected) {
    for (const corp of state.corpses ?? []) {
      const key = `${corp.square.r},${corp.square.c}`;
      // Skip corpses on squares that are currently occupied (no place to raise).
      if (state.board[corp.square.r][corp.square.c]) continue;
      const cdef = state.registry[corp.pieceId];
      if (!cdef) continue;
      if (cdef.special === "juggernaut" || cdef.immobile) continue;
      // Latest corpse wins for a given square.
      ghostMap.set(key, {
        id: corp.pieceId,
        color: humanColor, // raised piece will belong to us (undead if enemy)
        originalOwner: corp.originalOwner,
      });
    }
  }

  const rowIndices = Array.from({ length: rows }, (_, i) => i);
  const colIndices = Array.from({ length: cols }, (_, i) => i);
  const displayRows = (humanColor === "w" ? rowIndices.slice().reverse() : rowIndices.slice());
  const displayCols = (humanColor === "w" ? colIndices : colIndices.slice().reverse());
  if (flipped) { displayRows.reverse(); displayCols.reverse(); }

  const handleSquareClick = (sq: Square) => {
    if (disabled) return;
    if (dropPiece && dropTargets?.some((t) => t.r === sq.r && t.c === sq.c)) {
      onDrop?.(dropPiece, sq);
      return;
    }
    const p = state.board[sq.r][sq.c];
    if (selected) {
      if (selected.r === sq.r && selected.c === sq.c) { setSelected(null); return; }
      const ok = onMove(selected, sq);
      if (ok) { setSelected(null); return; }
      if (p) { setSelected(sq); return; }
      setSelected(null);
    } else {
      if (p) setSelected(sq);
    }

  };

  // Aspect ratio: cols / rows
  return (
    <div
      className="grid w-full max-w-[min(92vw,640px)] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-border"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        aspectRatio: `${cols} / ${rows}`,
      }}
    >
      {displayRows.map((r) =>
        displayCols.map((c) => {
          const sq: Square = { r, c };
          const piece = state.board[r][c];
          const def = piece ? state.registry[piece.id] : undefined;
          const light = (r + c) % 2 === 1;
          const isSelected = selected && selected.r === r && selected.c === c;
          const isLegal = legalTargets.some((t) => t.r === r && t.c === c);
          const isCapture = isLegal && !!piece;
          const isDropTarget = !!dropPiece && (dropTargets?.some((t) => t.r === r && t.c === c) ?? false);
          const isLast = last && (last.from && last.from.r === r && last.from.c === c) || (last && last.to.r === r && last.to.c === c);
          const isCheck = checkSquares.some((k) => k.r === r && k.c === c);

          const showFile = (humanColor === "w" ? r === 0 : r === rows - 1);
          const showRank = (humanColor === "w" ? c === 0 : c === cols - 1);
          const fileLabel = "abcdefghijkl"[c];
          const rankLabel = String(r + 1);

          return (
            <div
              key={`${r}-${c}`}
              className="relative flex items-center justify-center select-none cursor-pointer"
              style={{
                background: light ? "var(--color-board-light)" : "var(--color-board-dark)",
                fontSize: `calc(min(92vw, 640px) / ${cols} * 0.6)`,
              }}
              onClick={() => handleSquareClick(sq)}
              onDragOver={(e) => { if (dragFrom) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom) { onMove(dragFrom, sq); setDragFrom(null); setSelected(null); }
              }}
            >
              {isLast && (
                <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--color-board-last)" }} />
              )}
              {isSelected && (
                <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--color-board-highlight)" }} />
              )}
              {isCheck && (
                <div className="absolute inset-0 pointer-events-none animate-pulse"
                  style={{ background: "radial-gradient(circle, var(--color-board-check), transparent 70%)" }} />
              )}
              {showFile && (
                <span className="absolute bottom-0.5 right-1 text-[10px] font-semibold opacity-60"
                  style={{ color: light ? "oklch(0.3 0.04 145)" : "oklch(0.92 0.02 85)" }}>{fileLabel}</span>
              )}
              {showRank && (
                <span className="absolute top-0.5 left-1 text-[10px] font-semibold opacity-60"
                  style={{ color: light ? "oklch(0.3 0.04 145)" : "oklch(0.92 0.02 85)" }}>{rankLabel}</span>
              )}
              {isLegal && !isCapture && (
                <div className="absolute rounded-full pointer-events-none"
                  style={{ width: "30%", height: "30%", background: "var(--color-board-legal)" }} />
              )}
              {isLegal && isCapture && (
                <div className="absolute inset-1 rounded-full pointer-events-none ring-4"
                  style={{ borderColor: "var(--color-board-legal)", boxShadow: "inset 0 0 0 4px var(--color-board-legal)" }} />
              )}
              {isDropTarget && (
                <div className="absolute inset-1 rounded-lg pointer-events-none ring-2 ring-dashed"
                  style={{ borderColor: "var(--color-board-legal)", boxShadow: "inset 0 0 0 2px var(--color-board-legal)" }} />
              )}
              {piece && (() => {
                const isJugg = state.registry[piece.id]?.special === "juggernaut";
                if (isJugg) {
                  // Find partner (perpendicular to facing). Wide boards face along
                  // columns → partners differ by row; otherwise partners differ by column.
                  const wide = cols > rows;
                  const perpOffsets = wide
                    ? [{ dr: 1, dc: 0 }, { dr: -1, dc: 0 }]
                    : [{ dr: 0, dc: 1 }, { dr: 0, dc: -1 }];
                  let partner: Square | null = null;
                  for (const o of perpOffsets) {
                    const nr = r + o.dr, nc = c + o.dc;
                    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                    const t = state.board[nr][nc];
                    if (t && t.color === piece.color && state.registry[t.id]?.special === "juggernaut") {
                      partner = { r: nr, c: nc };
                      break;
                    }
                  }
                  // Render the unified 2-cell glyph only on the "lead" half (lower index
                  // on the perpendicular axis); the trailing half stays visually empty
                  // but still clickable/highlightable as its own square.
                  if (partner) {
                    const isLead = wide ? r < partner.r : c < partner.c;
                    if (!isLead) return null;
                    const orientation = wide ? "vertical" : "horizontal";
                    const facing: "up" | "down" | "left" | "right" = wide
                      ? (piece.color === "w" ? "right" : "left")
                      : (piece.color === "w" ? "up" : "down");
                    return (
                      <div
                        draggable={!disabled && piece.color === state.turn && piece.color === humanColor}
                        onDragStart={() => { setDragFrom(sq); setSelected(sq); }}
                        onDragEnd={() => setDragFrom(null)}
                        className="relative z-10 w-full h-full"
                      >
                        <JuggernautGlyph color={piece.color} orientation={orientation} facing={facing} />
                      </div>
                    );
                  }
                  // Orphan juggernaut (no partner) — fall through to normal glyph.
                }
                return (
                  <div
                    draggable={!disabled && piece.color === state.turn && piece.color === humanColor}
                    onDragStart={() => { setDragFrom(sq); setSelected(sq); }}
                    onDragEnd={() => setDragFrom(null)}
                    className="relative z-10 flex items-center justify-center w-full h-full"
                  >
                    <PieceGlyph piece={piece} def={def} />
                  </div>
                );
              })()}
              {/* Spirit View ghost — only when no piece occupies the square. */}
              {!piece && necromancerSelected && ghostMap.has(`${r},${c}`) && (() => {
                const g = ghostMap.get(`${r},${c}`)!;
                const gdef = state.registry[g.id];
                const isEnemy = g.originalOwner !== humanColor;
                return (
                  <div
                    className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none"
                    style={{ opacity: 0.45 }}
                    aria-hidden
                    title={`Ghost ${gdef?.name ?? g.id}${isEnemy ? " (will rise as Undead)" : ""}`}
                  >
                    <PieceGlyph piece={{ id: g.id, color: g.color, undead: isEnemy }} def={gdef} />
                  </div>
                );
              })()}
            </div>
          );
        }),
      )}
    </div>
  );
}
