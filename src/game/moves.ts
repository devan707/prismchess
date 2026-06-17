import type { Board, Color, Move, PromotionPiece, Square } from "./types";
import { cloneBoard, findKing, inBoardBounds } from "./board";

const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];
const KING_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];
const KNIGHT_DELTAS = [
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2],
];

function pawnDir(color: Color): number {
  return color === "w" ? 1 : -1;
}

function promotionRank(board: Board, color: Color): number {
  return color === "w" ? board.length - 1 : 0;
}

// Promotion choices available in the variant: derive from back rank actually on the board.
// For simplicity we expose Q,R,N,B if the king's back rank contains them.
function promotionOptions(board: Board, color: Color): PromotionPiece[] {
  const rank = color === "w" ? 0 : board.length - 1;
  const set = new Set<PromotionPiece>();
  for (let c = 0; c < board.length; c++) {
    // examine starting back rank pieces of own color in initial layout via current pieces is unreliable mid-game.
    // Instead, allow promotion to any piece that exists somewhere on the board for that color, plus minimum {R,N,B}.
    void c;
  }
  // Always allow R,N,B; allow Q only if a queen exists on the board for either color (i.e., variant includes queens).
  set.add("R"); set.add("N"); set.add("B");
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      const p = board[r][c];
      if (p && p.type === "Q") { set.add("Q"); break; }
    }
  }
  return Array.from(set);
}

export function pseudoLegalMovesFrom(board: Board, from: Square): Move[] {
  const p = board[from.r][from.c];
  if (!p) return [];
  const moves: Move[] = [];
  const push = (to: Square) => {
    const target = board[to.r][to.c];
    if (target && target.color === p.color) return;
    if (p.type === "P" && to.r === promotionRank(board, p.color)) {
      for (const promo of promotionOptions(board, p.color)) {
        moves.push({ from, to, piece: p, captured: target ?? null, promotion: promo });
      }
    } else {
      moves.push({ from, to, piece: p, captured: target ?? null });
    }
  };

  const slide = (dirs: number[][]) => {
    for (const [dr, dc] of dirs) {
      let r = from.r + dr;
      let c = from.c + dc;
      while (inBoardBounds(board, { r, c })) {
        const t = board[r][c];
        if (!t) {
          push({ r, c });
        } else {
          if (t.color !== p.color) push({ r, c });
          break;
        }
        r += dr;
        c += dc;
      }
    }
  };

  if (p.type === "K") {
    for (const [dr, dc] of KING_DIRS) {
      const to = { r: from.r + dr, c: from.c + dc };
      if (inBoardBounds(board, to)) push(to);
    }
  } else if (p.type === "N") {
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const to = { r: from.r + dr, c: from.c + dc };
      if (inBoardBounds(board, to)) push(to);
    }
  } else if (p.type === "R") {
    slide(ROOK_DIRS);
  } else if (p.type === "B") {
    slide(BISHOP_DIRS);
  } else if (p.type === "Q") {
    slide(QUEEN_DIRS);
  } else if (p.type === "P") {
    const dir = pawnDir(p.color);
    const f1 = { r: from.r + dir, c: from.c };
    if (inBoardBounds(board, f1) && !board[f1.r][f1.c]) push(f1);
    for (const dc of [-1, 1]) {
      const to = { r: from.r + dir, c: from.c + dc };
      if (!inBoardBounds(board, to)) continue;
      const t = board[to.r][to.c];
      if (t && t.color !== p.color) push(to);
    }
  }
  return moves;
}

export function applyMoveToBoard(board: Board, move: Move): Board {
  const b = cloneBoard(board);
  b[move.from.r][move.from.c] = null;
  let piece = move.piece;
  if (move.promotion) {
    piece = { type: move.promotion, color: move.piece.color };
  }
  b[move.to.r][move.to.c] = piece;
  return b;
}

export function isSquareAttacked(board: Board, sq: Square, byColor: Color): boolean {
  const n = board.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = board[r][c];
      if (!p || p.color !== byColor) continue;
      const moves = pseudoLegalMovesFrom(board, { r, c });
      for (const m of moves) {
        if (m.to.r === sq.r && m.to.c === sq.c) {
          if (p.type === "P" && m.to.c === c) continue; // forward push isn't an attack
          return true;
        }
      }
    }
  }
  return false;
}

export function inCheck(board: Board, color: Color): boolean {
  const k = findKing(board, color);
  if (!k) return false;
  return isSquareAttacked(board, k, color === "w" ? "b" : "w");
}

export function legalMovesFrom(board: Board, from: Square, turn: Color): Move[] {
  const p = board[from.r][from.c];
  if (!p || p.color !== turn) return [];
  return pseudoLegalMovesFrom(board, from).filter((m) => {
    const nb = applyMoveToBoard(board, m);
    return !inCheck(nb, turn);
  });
}

export function allLegalMoves(board: Board, turn: Color): Move[] {
  const out: Move[] = [];
  const n = board.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = board[r][c];
      if (!p || p.color !== turn) continue;
      out.push(...legalMovesFrom(board, { r, c }, turn));
    }
  }
  return out;
}
