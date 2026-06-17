import type { Board, CastlingRights, Color, GameState, Move, PromotionPiece, Square } from "./types";
import { backRankFor, cloneBoard, findKing, inBoardBounds } from "./board";

const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];
const KING_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];
const KNIGHT_DELTAS = [
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2],
];

export interface MoveCtx {
  enPassant: Square | null;
  castling: CastlingRights;
}

export function ctxFromState(s: GameState): MoveCtx {
  return { enPassant: s.enPassant, castling: s.castling };
}

function pawnDir(color: Color): number {
  return color === "w" ? 1 : -1;
}

function pawnStartRow(board: Board, color: Color): number {
  return color === "w" ? 1 : board.length - 2;
}

function promotionRank(board: Board, color: Color): number {
  return color === "w" ? board.length - 1 : 0;
}

function promotionOptions(board: Board, _color: Color): PromotionPiece[] {
  const set = new Set<PromotionPiece>(["R", "N", "B"]);
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      const p = board[r][c];
      if (p && p.type === "Q") { set.add("Q"); break; }
    }
  }
  return Array.from(set);
}

export function pseudoLegalMovesFrom(board: Board, from: Square, ctx?: MoveCtx): Move[] {
  const p = board[from.r][from.c];
  if (!p) return [];
  const moves: Move[] = [];
  const push = (to: Square, extra: Partial<Move> = {}) => {
    const target = board[to.r][to.c];
    if (target && target.color === p.color) return;
    if (p.type === "P" && to.r === promotionRank(board, p.color)) {
      for (const promo of promotionOptions(board, p.color)) {
        moves.push({ from, to, piece: p, captured: target ?? null, promotion: promo, ...extra });
      }
    } else {
      moves.push({ from, to, piece: p, captured: target ?? null, ...extra });
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
    // Castling (only with full context)
    if (ctx && ctx.castling[p.color].king) {
      const backRank = backRankFor(board, p.color);
      if (from.r === backRank) {
        const opp: Color = p.color === "w" ? "b" : "w";
        const kingSafe = !isSquareAttacked(board, from, opp);
        if (kingSafe) {
          const rooks = ctx.castling[p.color].rooks;
          for (const colStr of Object.keys(rooks)) {
            const rookCol = Number(colStr);
            if (!rooks[rookCol]) continue;
            // The rook must still be on its original square
            const rookSq = { r: backRank, c: rookCol };
            const rookPiece = board[rookSq.r][rookSq.c];
            if (!rookPiece || rookPiece.type !== "R" || rookPiece.color !== p.color) continue;
            const dir = Math.sign(rookCol - from.c);
            const dist = Math.abs(rookCol - from.c);
            if (dist < 2) continue; // king must move 2 toward rook
            const kingDest = { r: backRank, c: from.c + 2 * dir };
            const rookDest = { r: backRank, c: kingDest.c - dir };
            if (!inBoardBounds(board, kingDest)) continue;
            // All squares strictly between king and rook empty
            let empty = true;
            for (let c = from.c + dir; c !== rookCol; c += dir) {
              if (board[backRank][c]) { empty = false; break; }
            }
            if (!empty) continue;
            // King's path squares (intermediate + dest) not attacked
            const passSq = { r: backRank, c: from.c + dir };
            if (isSquareAttacked(board, passSq, opp)) continue;
            if (isSquareAttacked(board, kingDest, opp)) continue;
            moves.push({
              from,
              to: kingDest,
              piece: p,
              captured: null,
              kind: "castle",
              rookFrom: rookSq,
              rookTo: rookDest,
            });
          }
        }
      }
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
    if (inBoardBounds(board, f1) && !board[f1.r][f1.c]) {
      push(f1);
      // Double push from starting row
      if (from.r === pawnStartRow(board, p.color)) {
        const f2 = { r: from.r + 2 * dir, c: from.c };
        if (inBoardBounds(board, f2) && !board[f2.r][f2.c]) {
          moves.push({ from, to: f2, piece: p, captured: null, kind: "double" });
        }
      }
    }
    for (const dc of [-1, 1]) {
      const to = { r: from.r + dir, c: from.c + dc };
      if (!inBoardBounds(board, to)) continue;
      const t = board[to.r][to.c];
      if (t && t.color !== p.color) {
        push(to);
      } else if (!t && ctx && ctx.enPassant && ctx.enPassant.r === to.r && ctx.enPassant.c === to.c) {
        // En passant — captured pawn sits on (from.r, to.c)
        const capSq = { r: from.r, c: to.c };
        const capPiece = board[capSq.r][capSq.c];
        if (capPiece && capPiece.type === "P" && capPiece.color !== p.color) {
          moves.push({
            from,
            to,
            piece: p,
            captured: capPiece,
            kind: "ep",
            epCapture: capSq,
          });
        }
      }
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
  if (move.kind === "castle" && move.rookFrom && move.rookTo) {
    const rook = b[move.rookFrom.r][move.rookFrom.c];
    b[move.rookFrom.r][move.rookFrom.c] = null;
    b[move.rookTo.r][move.rookTo.c] = rook;
  }
  if (move.kind === "ep" && move.epCapture) {
    b[move.epCapture.r][move.epCapture.c] = null;
  }
  return b;
}

export function isSquareAttacked(board: Board, sq: Square, byColor: Color): boolean {
  const n = board.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = board[r][c];
      if (!p || p.color !== byColor) continue;
      // No ctx — castling/EP/double don't matter for attack detection
      const moves = pseudoLegalMovesFrom(board, { r, c });
      for (const m of moves) {
        if (m.to.r === sq.r && m.to.c === sq.c) {
          if (p.type === "P" && m.to.c === c) continue;
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

export function legalMovesFrom(board: Board, from: Square, turn: Color, ctx?: MoveCtx): Move[] {
  const p = board[from.r][from.c];
  if (!p || p.color !== turn) return [];
  return pseudoLegalMovesFrom(board, from, ctx).filter((m) => {
    const nb = applyMoveToBoard(board, m);
    return !inCheck(nb, turn);
  });
}

export function allLegalMoves(board: Board, turn: Color, ctx?: MoveCtx): Move[] {
  const out: Move[] = [];
  const n = board.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = board[r][c];
      if (!p || p.color !== turn) continue;
      out.push(...legalMovesFrom(board, { r, c }, turn, ctx));
    }
  }
  return out;
}
