import { BOARD_SIZE, type Board, type Color, type Move, type Piece, type Square } from "./types";
import { cloneBoard, findKing, inBounds } from "./board";

const BISHOP_DIRS = [
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const KING_DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const KNIGHT_DELTAS = [
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2],
];

function pawnDir(color: Color): number {
  return color === "w" ? 1 : -1;
}

function promotionRank(color: Color): number {
  return color === "w" ? BOARD_SIZE - 1 : 0;
}

// Pseudo-legal moves (does not filter own-king-in-check)
export function pseudoLegalMovesFrom(board: Board, from: Square): Move[] {
  const p = board[from.r][from.c];
  if (!p) return [];
  const moves: Move[] = [];
  const push = (to: Square, opts: Partial<Move> = {}) => {
    const target = board[to.r][to.c];
    if (target && target.color === p.color) return;
    if (p.type === "P" && to.r === promotionRank(p.color)) {
      // generate both promotion options
      moves.push({ from, to, piece: p, captured: target ?? null, promotion: "N" });
      moves.push({ from, to, piece: p, captured: target ?? null, promotion: "B" });
    } else {
      moves.push({ from, to, piece: p, captured: target ?? null, ...opts });
    }
  };

  if (p.type === "K") {
    for (const [dr, dc] of KING_DIRS) {
      const to = { r: from.r + dr, c: from.c + dc };
      if (!inBounds(to)) continue;
      push(to);
    }
  } else if (p.type === "N") {
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const to = { r: from.r + dr, c: from.c + dc };
      if (!inBounds(to)) continue;
      push(to);
    }
  } else if (p.type === "B") {
    for (const [dr, dc] of BISHOP_DIRS) {
      let r = from.r + dr;
      let c = from.c + dc;
      while (inBounds({ r, c })) {
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
  } else if (p.type === "P") {
    const dir = pawnDir(p.color);
    // forward
    const f1 = { r: from.r + dir, c: from.c };
    if (inBounds(f1) && !board[f1.r][f1.c]) push(f1);
    // captures
    for (const dc of [-1, 1]) {
      const to = { r: from.r + dir, c: from.c + dc };
      if (!inBounds(to)) continue;
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
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p || p.color !== byColor) continue;
      // For attack detection we use pseudo-legal targets, ignoring promotion duplicates
      const moves = pseudoLegalMovesFrom(board, { r, c });
      for (const m of moves) {
        if (m.to.r === sq.r && m.to.c === sq.c) {
          // Pawns: pseudoLegalMovesFrom only generates captures on diagonals, so this is correct
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
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p || p.color !== turn) continue;
      out.push(...legalMovesFrom(board, { r, c }, turn));
    }
  }
  return out;
}
