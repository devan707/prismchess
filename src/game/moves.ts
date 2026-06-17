import type { Board, Color, GameState, Move, MovementSpec, Offset, Piece, PieceDef, PieceId, Square } from "./types";
import { cloneBoard, findRoyals, inBoardBounds } from "./board";

function rowsCols(board: Board): { rows: number; cols: number } {
  return { rows: board.length, cols: board[0]?.length ?? 0 };
}

function isEnemy(p: Piece | null, color: Color): boolean {
  return !!p && p.color !== color;
}
function isFriendly(p: Piece | null, color: Color): boolean {
  return !!p && p.color === color;
}

function isBarricade(p: Piece | null, registry: Record<PieceId, PieceDef>): boolean {
  return !!p && !!registry[p.id]?.immobile;
}

function emitFromSpec(
  board: Board,
  registry: Record<PieceId, PieceDef>,
  from: Square,
  piece: Piece,
  spec: MovementSpec,
  mode: "move" | "capture" | "both",
): Square[] {
  const out: Square[] = [];
  const { rows, cols } = rowsCols(board);
  const inB = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;

  const accept = (target: Square, occ: Piece | null) => {
    if (isBarricade(occ, registry)) return false;
    if (occ === null) return mode === "move" || mode === "both";
    if (isFriendly(occ, piece.color)) return false;
    // enemy
    return mode === "capture" || mode === "both";
  };

  if (spec.leaps) {
    for (const o of spec.leaps) {
      const r = from.r + o.dr;
      const c = from.c + o.dc;
      if (!inB(r, c)) continue;
      const t = board[r][c];
      if (accept({ r, c }, t)) out.push({ r, c });
    }
  }
  if (spec.slides) {
    for (const d of spec.slides) {
      const max = d.max && d.max > 0 ? d.max : Math.max(rows, cols);
      let r = from.r + d.dr;
      let c = from.c + d.dc;
      let steps = 0;
      while (inB(r, c) && steps < max) {
        const t = board[r][c];
        if (isBarricade(t, registry)) break;
        if (!t) {
          if (mode !== "capture") out.push({ r, c });
        } else {
          if (isFriendly(t, piece.color)) break;
          if (mode !== "move") out.push({ r, c });
          break;
        }
        if (!spec.slidersJump && t) break;
        r += d.dr;
        c += d.dc;
        steps++;
      }
    }
  }
  return out;
}

function pawnDir(color: Color): number { return color === "w" ? 1 : -1; }

function boardIsWide(board: Board): boolean {
  const { rows, cols } = rowsCols(board);
  return cols > rows;
}

/** Juggernaut helpers — a J piece is always one half of an adjacent pair. */
function juggPerpOffsets(wide: boolean): Offset[] {
  // Pair members sit side-by-side perpendicular to facing.
  // wide boards face along the column axis → partners differ by row.
  return wide ? [{ dr: 1, dc: 0 }, { dr: -1, dc: 0 }] : [{ dr: 0, dc: 1 }, { dr: 0, dc: -1 }];
}
function findJuggPartner(
  board: Board,
  sq: Square,
  color: Color,
  registry: Record<PieceId, PieceDef>,
): Square | null {
  const wide = boardIsWide(board);
  for (const o of juggPerpOffsets(wide)) {
    const r = sq.r + o.dr;
    const c = sq.c + o.dc;
    if (!inBoardBounds(board, { r, c })) continue;
    const t = board[r][c];
    if (t && t.color === color && registry[t.id]?.special === "juggernaut") return { r, c };
  }
  return null;
}
/** True if `attacker` lies in the juggernaut's front arc (strictly ahead along facing). */
function attackerInJuggFrontArc(jugSq: Square, attacker: Square, juggColor: Color, wide: boolean): boolean {
  const dir = juggColor === "w" ? 1 : -1;
  const jf = wide ? jugSq.c : jugSq.r;
  const af = wide ? attacker.c : attacker.r;
  return (af - jf) * dir > 0;
}

function promotionOptionsFor(state: GameState): PieceId[] {
  const out: PieceId[] = [];
  for (const id of Object.keys(state.registry)) {
    const def = state.registry[id];
    if (def.canBePromoted) out.push(id);
  }
  // Prefer Q,R,B,N order
  const order = ["Q", "R", "B", "N"];
  out.sort((a, b) => {
    const ai = order.indexOf(a); const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });
  return out;
}

/** Pseudo-legal moves for the piece at `from`. */
export function pseudoMovesFrom(state: GameState, from: Square): Move[] {
  const board = state.board;
  const piece = board[from.r][from.c];
  if (!piece) return [];
  const def = state.registry[piece.id];
  if (!def) return [];
  if (def.immobile) return []; // barricade never moves

  const moves: Move[] = [];

  if (def.special === "pawn" || def.special === "shapeshifter") {
    const isShifter = def.special === "shapeshifter";
    const wide = boardIsWide(board);
    const { rows, cols } = rowsCols(board);
    const dir = pawnDir(piece.color);
    const promoLine = wide ? (piece.color === "w" ? cols - 1 : 0) : (piece.color === "w" ? rows - 1 : 0);
    const startLine = wide ? (piece.color === "w" ? 1 : cols - 2) : (piece.color === "w" ? 1 : rows - 2);
    const onPromoLine = (sq: Square) => (wide ? sq.c : sq.r) === promoLine;
    const onStartLine = (sq: Square) => (wide ? sq.c : sq.r) === startLine;
    const pushPawn = (to: Square, captured: Piece | null, extra: Partial<Move> = {}) => {
      // Shapeshifter: capturing transforms into the captured piece (no promotion);
      // a non-capturing push to the promotion line just stays a shapeshifter.
      if (isShifter) {
        if (captured) {
          moves.push({ from, to, piece, captured, ...extra, shapeshiftTo: captured.id });
        } else {
          moves.push({ from, to, piece, captured, ...extra });
        }
        return;
      }
      if (onPromoLine(to)) {
        for (const promo of promotionOptionsFor(state)) {
          moves.push({ from, to, piece, captured, promotion: promo, kind: extra.kind, epCapture: extra.epCapture });
        }
      } else {
        moves.push({ from, to, piece, captured, ...extra });
      }
    };

    if (wide) {
      // forward along columns
      const f1 = { r: from.r, c: from.c + dir };
      if (inBoardBounds(board, f1) && !board[f1.r][f1.c]) {
        pushPawn(f1, null);
        if (onStartLine(from)) {
          const f2 = { r: from.r, c: from.c + 2 * dir };
          if (inBoardBounds(board, f2) && !board[f2.r][f2.c]) {
            moves.push({ from, to: f2, piece, captured: null, kind: "double" });
          }
        }
      }
      // diagonal captures along rows
      for (const dr of [-1, 1]) {
        const to = { r: from.r + dr, c: from.c + dir };
        if (!inBoardBounds(board, to)) continue;
        const t = board[to.r][to.c];
        if (t && t.color !== piece.color && !isBarricade(t, state.registry)) {
          pushPawn(to, t);
        } else if (!t && state.enPassant && state.enPassant.r === to.r && state.enPassant.c === to.c) {
          const capSq = { r: to.r, c: from.c };
          const cap = board[capSq.r][capSq.c];
          if (cap && cap.color !== piece.color && state.registry[cap.id]?.special === "pawn") {
            moves.push({ from, to, piece, captured: cap, kind: "ep", epCapture: capSq });
          }
        }
      }
    } else {
      // forward along rows
      const f1 = { r: from.r + dir, c: from.c };
      if (inBoardBounds(board, f1) && !board[f1.r][f1.c]) {
        pushPawn(f1, null);
        if (onStartLine(from)) {
          const f2 = { r: from.r + 2 * dir, c: from.c };
          if (inBoardBounds(board, f2) && !board[f2.r][f2.c]) {
            moves.push({ from, to: f2, piece, captured: null, kind: "double" });
          }
        }
      }
      // diagonal captures along columns
      for (const dc of [-1, 1]) {
        const to = { r: from.r + dir, c: from.c + dc };
        if (!inBoardBounds(board, to)) continue;
        const t = board[to.r][to.c];
        if (t && t.color !== piece.color && !isBarricade(t, state.registry)) {
          pushPawn(to, t);
        } else if (!t && state.enPassant && state.enPassant.r === to.r && state.enPassant.c === to.c) {
          const capSq = { r: from.r, c: to.c };
          const cap = board[capSq.r][capSq.c];
          if (cap && cap.color !== piece.color && state.registry[cap.id]?.special === "pawn") {
            moves.push({ from, to, piece, captured: cap, kind: "ep", epCapture: capSq });
          }
        }
      }
    }
    return moves;
  }

  if (def.special === "dragon") {
    // Teleport: to any empty (non-barricade) square != from
    const { rows, cols } = rowsCols(board);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === from.r && c === from.c) continue;
        if (board[r][c]) continue;
        moves.push({ from, to: { r, c }, piece, captured: null, kind: "normal" });
      }
    }
    // Adjacent attack-in-place
    for (const o of [
      { dr: 1, dc: 0 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 0, dc: -1 },
      { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
    ]) {
      const to = { r: from.r + o.dr, c: from.c + o.dc };
      if (!inBoardBounds(board, to)) continue;
      const t = board[to.r][to.c];
      if (t && t.color !== piece.color && !isBarricade(t, state.registry)) {
        moves.push({ from, to, piece, captured: t, kind: "dragonAttack" });
      }
    }
    return moves;
  }

  if (def.special === "portal") {
    // Swap with any friendly piece on the board (other than self).
    const { rows, cols } = rowsCols(board);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === from.r && c === from.c) continue;
        const t = board[r][c];
        if (!t || t.color !== piece.color) continue;
        if (isBarricade(t, state.registry)) continue;
        moves.push({ from, to: { r, c }, piece, captured: null, kind: "portalSwap" });
      }
    }
    return moves;
  }

  if (def.special === "necromancer") {
    // Normal diagonal moves come from the generic spec below; add resurrection actions.
    if (def.movement || def.capture) {
      const moveSpec = def.movement ?? {};
      const captureSpec = def.capture ?? moveSpec;
      const moveTargets = emitFromSpec(board, state.registry, from, piece, moveSpec, "move");
      const captureTargets = emitFromSpec(board, state.registry, from, piece, captureSpec, "capture");
      for (const t of moveTargets) moves.push({ from, to: t, piece, captured: null });
      for (const t of captureTargets) {
        const occ = board[t.r][t.c];
        if (occ && occ.color !== piece.color && !isBarricade(occ, state.registry)) {
          moves.push({ from, to: t, piece, captured: occ });
        }
      }
    }
    // Friendly captured pieces live in state.captured[opposite color].
    const friendlyCaptured = state.captured[piece.color === "w" ? "b" : "w"];
    if (friendlyCaptured.length > 0) {
      const uniqueIds = Array.from(new Set(friendlyCaptured.map((p) => p.id)));
      for (const o of [
        { dr: 1, dc: 0 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 0, dc: -1 },
        { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
      ]) {
        const to = { r: from.r + o.dr, c: from.c + o.dc };
        if (!inBoardBounds(board, to)) continue;
        if (board[to.r][to.c]) continue;
        for (const id of uniqueIds) {
          moves.push({ from, to, piece, captured: null, kind: "resurrect", resurrectPieceId: id });
        }
      }
    }
    return moves;
  }

  if (def.special === "juggernaut") {
    const partner = findJuggPartner(board, from, piece.color, state.registry);
    if (!partner) return moves; // orphan J can't act
    const { rows, cols } = rowsCols(board);
    const wide = boardIsWide(board);
    const dir = piece.color === "w" ? 1 : -1;
    const inB = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
    const isSelfCell = (r: number, c: number) =>
      (r === from.r && c === from.c) || (r === partner.r && c === partner.c);

    // SHIFT ±1 along the perpendicular axis (sideways).
    for (const sign of [1, -1]) {
      const dRow = wide ? sign : 0;
      const dCol = wide ? 0 : sign;
      const nF = { r: from.r + dRow, c: from.c + dCol };
      const nP = { r: partner.r + dRow, c: partner.c + dCol };
      if (!inB(nF.r, nF.c) || !inB(nP.r, nP.c)) continue;
      const okCell = (r: number, c: number) => {
        if (isSelfCell(r, c)) return true;
        return board[r][c] === null;
      };
      if (!okCell(nF.r, nF.c) || !okCell(nP.r, nP.c)) continue;
      moves.push({ from, to: nF, piece, captured: null, kind: "juggShift" });
    }

    // CHARGE forward — single maximal move; tramples enemies, stops before friendly, exits off enemy edge.
    const stepDr = wide ? 0 : dir;
    const stepDc = wide ? dir : 0;
    const trampled: Piece[] = [];
    let steps = 0;
    let exited = false;
    let curF = { ...from };
    let curP = { ...partner };
    while (true) {
      const nF = { r: curF.r + stepDr, c: curF.c + stepDc };
      const nP = { r: curP.r + stepDr, c: curP.c + stepDc };
      const outF = !inB(nF.r, nF.c);
      const outP = !inB(nP.r, nP.c);
      if (outF && outP) { exited = true; break; }
      if (outF || outP) break;
      const t1 = board[nF.r][nF.c];
      const t2 = board[nP.r][nP.c];
      const blocks = (t: Piece | null) =>
        !!t && (t.color === piece.color || isBarricade(t, state.registry));
      if (blocks(t1) || blocks(t2)) break;
      if (t1 && t1.color !== piece.color) trampled.push(t1);
      if (t2 && t2.color !== piece.color) trampled.push(t2);
      curF = nF; curP = nP;
      steps++;
    }
    if (exited) {
      moves.push({
        from, to: { ...from }, piece, captured: null, kind: "juggExit",
        juggTrampled: trampled.length ? trampled : undefined,
      });
    } else if (steps > 0) {
      moves.push({
        from, to: curF, piece, captured: trampled[0] ?? null, kind: "juggCharge",
        juggTrampled: trampled.length ? trampled : undefined,
      });
    }
    return moves;
  }




  // Generic data-driven piece
  if (def.movement || def.capture) {
    const moveSpec = def.movement ?? {};
    const captureSpec = def.capture ?? moveSpec;
    const moveTargets = emitFromSpec(board, state.registry, from, piece, moveSpec, "move");
    const captureTargets = emitFromSpec(board, state.registry, from, piece, captureSpec, "capture");
    for (const t of moveTargets) {
      moves.push({ from, to: t, piece, captured: null });
    }
    for (const t of captureTargets) {
      const occ = board[t.r][t.c];
      if (occ && occ.color !== piece.color && !isBarricade(occ, state.registry)) {
        moves.push({ from, to: t, piece, captured: occ });
      }
    }
  }

  return moves;
}

/** All drops a side can play right now. */
export function dropMoves(state: GameState, color: Color): Move[] {
  const out: Move[] = [];
  const reserves = state.reserves[color];
  if (!reserves) return out;
  const { rows, cols } = rowsCols(state.board);
  for (const id of Object.keys(reserves)) {
    const count = reserves[id];
    if (!count) continue;
    const def = state.registry[id];
    if (!def) continue;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (state.board[r][c]) continue;
        out.push({
          from: null,
          to: { r, c },
          piece: { id, color },
          captured: null,
          kind: "drop",
          dropPieceId: id,
        });
      }
    }
  }
  return out;
}

export function applyMoveToBoard(board: Board, move: Move): Board {
  const b = cloneBoard(board);
  if (move.kind === "drop") {
    b[move.to.r][move.to.c] = { id: move.piece.id, color: move.piece.color };
    return b;
  }
  if (move.kind === "dragonAttack") {
    // Dragon stays; enemy removed.
    b[move.to.r][move.to.c] = null;
    return b;
  }
  if (move.kind === "portalSwap" && move.from) {
    const friendly = b[move.to.r][move.to.c];
    b[move.to.r][move.to.c] = { id: move.piece.id, color: move.piece.color };
    b[move.from.r][move.from.c] = friendly;
    return b;
  }
  if (move.kind === "resurrect" && move.resurrectPieceId) {
    // Necromancer stays; new piece appears at `to`.
    b[move.to.r][move.to.c] = { id: move.resurrectPieceId, color: move.piece.color };
    return b;
  }
  if (move.kind === "juggShift" || move.kind === "juggCharge" || move.kind === "juggExit") {
    if (!move.from) return b;
    const color = move.piece.color;
    const wide = boardIsWide(b);
    const { rows, cols } = rowsCols(b);
    // Find partner adjacent on perp axis
    let partner: Square | null = null;
    for (const o of juggPerpOffsets(wide)) {
      const r = move.from.r + o.dr;
      const c = move.from.c + o.dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      const t = b[r][c];
      if (t && t.color === color && t.id === "J") { partner = { r, c }; break; }
    }
    if (!partner) return b;
    // Clear current pair cells.
    b[move.from.r][move.from.c] = null;
    b[partner.r][partner.c] = null;
    if (move.kind === "juggExit") return b;
    const dr = move.to.r - move.from.r;
    const dc = move.to.c - move.from.c;
    // For charges, clear any trampled cells along the path on the partner lane too.
    if (move.kind === "juggCharge") {
      const stepCount = Math.abs(dr) + Math.abs(dc);
      const sDr = dr === 0 ? 0 : Math.sign(dr);
      const sDc = dc === 0 ? 0 : Math.sign(dc);
      const trampledJuggs: { sq: Square; color: Color }[] = [];
      for (let s = 1; s <= stepCount; s++) {
        const fr = move.from.r + s * sDr;
        const fc = move.from.c + s * sDc;
        const pr = partner.r + s * sDr;
        const pc = partner.c + s * sDc;
        for (const cell of [{ r: fr, c: fc }, { r: pr, c: pc }]) {
          const t = b[cell.r][cell.c];
          if (t && t.id === "J" && t.color !== color) trampledJuggs.push({ sq: cell, color: t.color });
        }
        b[fr][fc] = null;
        b[pr][pc] = null;
      }
      // Destroy partners of any trampled juggernauts (they lie on perpendicular cells).
      const wideB = boardIsWide(b);
      for (const tj of trampledJuggs) {
        for (const o of juggPerpOffsets(wideB)) {
          const r = tj.sq.r + o.dr;
          const c = tj.sq.c + o.dc;
          if (r < 0 || r >= b.length || c < 0 || c >= b[0].length) continue;
          const t = b[r][c];
          if (t && t.id === "J" && t.color === tj.color) { b[r][c] = null; break; }
        }
      }
    }
    b[move.to.r][move.to.c] = { id: "J", color };
    b[partner.r + dr][partner.c + dc] = { id: "J", color };
    return b;
  }
  if (move.from) {
    b[move.from.r][move.from.c] = null;
  }
  let piece: Piece = move.piece;
  if (move.shapeshiftTo) {
    piece = { id: move.shapeshiftTo, color: move.piece.color };
  } else if (move.promotion) {
    piece = { id: move.promotion, color: move.piece.color };
  }
  b[move.to.r][move.to.c] = piece;
  if (move.kind === "ep" && move.epCapture) {
    b[move.epCapture.r][move.epCapture.c] = null;
  }
  // Side/rear capture of a juggernaut destroys its partner too.
  if (move.captured && move.captured.id === "J") {
    const wide = boardIsWide(b);
    const { rows, cols } = rowsCols(b);
    for (const o of juggPerpOffsets(wide)) {
      const r = move.to.r + o.dr;
      const c = move.to.c + o.dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      const t = b[r][c];
      if (t && t.id === "J" && t.color === move.captured.color) {
        b[r][c] = null;
        break;
      }
    }
  }
  return b;
}

/** Is `sq` attacked by any piece of `byColor`? Ignores drops & King's Hand (since it can't deliver check to a king relative to royalty — it CAN deliver check actually). */
export function isSquareAttacked(state: GameState, sq: Square, byColor: Color): boolean {
  const board = state.board;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const p = board[r][c];
      if (!p || p.color !== byColor) continue;
      // Use a scratch state for pseudo move gen (no EP capturing on empty square unrelated)
      const moves = pseudoMovesFrom(state, { r, c });
      for (const m of moves) {
        if (m.to.r === sq.r && m.to.c === sq.c && m.kind !== "drop") {
          // dragon teleport attacks empty squares; doesn't capture there. Filter:
          if (m.kind === "normal" && state.registry[p.id]?.special === "dragon") continue;
          // portal swaps land on friendly squares (never an enemy king square anyway).
          if (m.kind === "portalSwap") continue;
          // resurrect places a friendly piece on an empty square — not an attack.
          if (m.kind === "resurrect") continue;
          // juggernaut shift/charge are repositioning; trampling captures the cell directly.
          // A charge that lands on `sq` only attacks if `sq` is on the destination row/col,
          // but here `to` IS the destination — so it's a real capture path.
          if (m.kind === "juggShift" || m.kind === "juggExit") continue;
          return true;
        }
      }
    }
  }
  return false;
}

export function inCheck(state: GameState, color: Color): boolean {
  const royals = findRoyals(state, color);
  if (royals.length === 0) return false;
  const opp: Color = color === "w" ? "b" : "w";
  return royals.some((sq) => isSquareAttacked(state, sq, opp));
}

/** Apply a move to a full GameState (for "would this leave me in check" tests). */
function applyMoveToState(state: GameState, move: Move): GameState {
  const board = applyMoveToBoard(state.board, move);
  const reserves = {
    w: { ...state.reserves.w },
    b: { ...state.reserves.b },
  };
  if (move.kind === "drop" && move.dropPieceId) {
    reserves[move.piece.color][move.dropPieceId] = Math.max(0, (reserves[move.piece.color][move.dropPieceId] ?? 0) - 1);
  }
  let captured = state.captured;
  if (move.captured || move.kind === "resurrect" || move.juggTrampled) {
    const w = [...state.captured.w];
    const b = [...state.captured.b];
    const targetPool = state.turn === "w" ? w : b;
    // For juggCharge, `captured` is also the first entry in juggTrampled — don't double-count.
    if (move.captured && move.kind !== "juggCharge") {
      targetPool.push(move.captured as Piece);
      if (move.captured.id === "J") {
        targetPool.push({ id: "J", color: move.captured.color });
      }
    }
    if (move.juggTrampled) {
      for (const p of move.juggTrampled) {
        targetPool.push(p);
        if (p.id === "J") targetPool.push({ id: "J", color: p.color });
      }
    }
    if (move.kind === "resurrect" && move.resurrectPieceId) {
      const friendly = state.turn === "w" ? b : w;
      const idx = friendly.findIndex((p) => p.id === move.resurrectPieceId);
      if (idx >= 0) friendly.splice(idx, 1);
    }
    captured = { w, b };
  }
  return {
    ...state,
    board,
    reserves,
    captured,
    enPassant: move.kind === "double" && move.from
      ? (move.from.r !== move.to.r
          ? { r: (move.from.r + move.to.r) / 2, c: move.from.c }
          : { r: move.from.r, c: (move.from.c + move.to.c) / 2 })
      : null,
    turn: state.turn === "w" ? "b" : "w",
  };
}

export function legalMovesFrom(state: GameState, from: Square): Move[] {
  const p = state.board[from.r][from.c];
  if (!p || p.color !== state.turn) return [];
  const wide = state.cols > state.rows;
  return pseudoMovesFrom(state, from).filter((m) => {
    // Front-arc immunity: a juggernaut cannot be captured from the front.
    if (m.captured && m.captured.id === "J" && m.from) {
      if (attackerInJuggFrontArc(m.to, m.from, m.captured.color, wide)) return false;
    }
    // Juggernaut charge trampling also obeys front-arc immunity for any enemy J in path.
    if (m.juggTrampled && m.juggTrampled.some((p) => p.id === "J") && m.from) {
      // The juggernaut chargers come head-on (their forward = enemy J's front) — so
      // a charge tramples an enemy J only if approaching from the rear arc. Reject head-on.
      const enemyColor = m.juggTrampled.find((p) => p.id === "J")!.color;
      const dir = m.piece.color === "w" ? 1 : -1;
      if (m.piece.color !== enemyColor && dir === (enemyColor === "w" ? 1 : -1)) {
        // same direction means they face same way — possible (e.g. both white). Different
        // colors charging head-on would always be front-arc for the defender. Block it.
        return false;
      }
      // Different-color juggernauts always face opposite — head-on charge would be front-arc, illegal.
      if (m.piece.color !== enemyColor) return false;
    }
    const next = applyMoveToState(state, m);
    return !inCheck({ ...next, turn: state.turn }, state.turn);
  });
}

export function allLegalMoves(state: GameState): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < state.board.length; r++) {
    for (let c = 0; c < state.board[0].length; c++) {
      const p = state.board[r][c];
      if (!p || p.color !== state.turn) continue;
      out.push(...legalMovesFrom(state, { r, c }));
    }
  }
  // Drops
  for (const m of dropMoves(state, state.turn)) {
    const next = applyMoveToState(state, m);
    if (!inCheck({ ...next, turn: state.turn }, state.turn)) out.push(m);
  }
  return out;
}

export { applyMoveToState };
