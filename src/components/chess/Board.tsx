import { useState } from "react";
import type { GameState, Square } from "@/game/types";
import { PieceGlyph } from "./PieceGlyph";
import { findKing } from "@/game/board";
import { inCheck } from "@/game/moves";

interface BoardProps {
  state: GameState;
  humanColor: "w" | "b";
  flipped: boolean;
  legalFor: (sq: Square | null) => Square[];
  onMove: (from: Square, to: Square) => boolean;
  disabled?: boolean;
}

export function Board({ state, humanColor, flipped, legalFor, onMove, disabled }: BoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [dragFrom, setDragFrom] = useState<Square | null>(null);

  const size = state.board.length;
  const legalTargets = legalFor(selected ?? dragFrom);
  const last = state.history[state.history.length - 1];

  const checkColor = inCheck(state.board, state.turn) ? state.turn : null;
  const checkSquare = checkColor ? findKing(state.board, checkColor) : null;

  const rows = Array.from({ length: size }, (_, i) => i);
  const cols = Array.from({ length: size }, (_, i) => i);
  const displayRows = (humanColor === "w" ? rows.slice().reverse() : rows.slice());
  const displayCols = (humanColor === "w" ? cols : cols.slice().reverse());
  if (flipped) {
    displayRows.reverse();
    displayCols.reverse();
  }

  const handleSquareClick = (sq: Square) => {
    if (disabled) return;
    const p = state.board[sq.r][sq.c];
    if (selected) {
      if (selected.r === sq.r && selected.c === sq.c) {
        setSelected(null);
        return;
      }
      const ok = onMove(selected, sq);
      if (ok) {
        setSelected(null);
        return;
      }
      if (p && p.color === state.turn) {
        setSelected(sq);
        return;
      }
      setSelected(null);
    } else {
      if (p && p.color === state.turn) setSelected(sq);
    }
  };

  return (
    <div
      className="grid aspect-square w-full max-w-[min(92vw,560px)] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-border"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
      }}
    >
      {displayRows.map((r) =>
        displayCols.map((c) => {
          const sq: Square = { r, c };
          const piece = state.board[r][c];
          const light = (r + c) % 2 === 1;
          const isSelected = selected && selected.r === r && selected.c === c;
          const isLegal = legalTargets.some((t) => t.r === r && t.c === c);
          const isCapture = isLegal && !!piece;
          const isLast = last && ((last.from.r === r && last.from.c === c) || (last.to.r === r && last.to.c === c));
          const isCheck = checkSquare && checkSquare.r === r && checkSquare.c === c;

          const showFile = (humanColor === "w" ? r === 0 : r === size - 1);
          const showRank = (humanColor === "w" ? c === 0 : c === size - 1);
          const fileLabel = "abcdefgh"[c];
          const rankLabel = String(r + 1);

          return (
            <div
              key={`${r}-${c}`}
              className="relative flex items-center justify-center select-none cursor-pointer"
              style={{
                background: light ? "var(--color-board-light)" : "var(--color-board-dark)",
              }}
              onClick={() => handleSquareClick(sq)}
              onDragOver={(e) => {
                if (dragFrom) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom) {
                  onMove(dragFrom, sq);
                  setDragFrom(null);
                  setSelected(null);
                }
              }}
            >
              {isLast && (
                <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--color-board-last)" }} />
              )}
              {isSelected && (
                <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--color-board-highlight)" }} />
              )}
              {isCheck && (
                <div
                  className="absolute inset-0 pointer-events-none animate-pulse"
                  style={{ background: "radial-gradient(circle, var(--color-board-check), transparent 70%)" }}
                />
              )}
              {showFile && (
                <span
                  className="absolute bottom-0.5 right-1 text-[10px] font-semibold opacity-60"
                  style={{ color: light ? "oklch(0.3 0.04 145)" : "oklch(0.92 0.02 85)" }}
                >
                  {fileLabel}
                </span>
              )}
              {showRank && (
                <span
                  className="absolute top-0.5 left-1 text-[10px] font-semibold opacity-60"
                  style={{ color: light ? "oklch(0.3 0.04 145)" : "oklch(0.92 0.02 85)" }}
                >
                  {rankLabel}
                </span>
              )}
              {isLegal && !isCapture && (
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: "30%",
                    height: "30%",
                    background: "var(--color-board-legal)",
                  }}
                />
              )}
              {isLegal && isCapture && (
                <div
                  className="absolute inset-1 rounded-full pointer-events-none ring-4"
                  style={{ borderColor: "var(--color-board-legal)", boxShadow: "inset 0 0 0 4px var(--color-board-legal)" }}
                />
              )}
              {piece && (
                <div
                  draggable={!disabled && piece.color === state.turn && piece.color === humanColor}
                  onDragStart={() => {
                    setDragFrom(sq);
                    setSelected(sq);
                  }}
                  onDragEnd={() => setDragFrom(null)}
                  className="relative z-10 flex items-center justify-center w-full h-full"
                >
                  <PieceGlyph
                    piece={piece}
                    className="text-[clamp(2rem,9vw,4.5rem)] drop-shadow"
                  />
                </div>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}
