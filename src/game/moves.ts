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

function isBarricade(_p: Piece | null, _registry: Record<PieceId, PieceDef>): boolean {
  // Barricades behave like ordinary pieces for blocking and capture — they
  // simply can't move themselves (enforced by def.immobile in pseudoMovesFrom).
  // Returning false here lets sliders stop on them, leapers capture them,
  // pawns take them diagonally, and juggernauts trample them like anything else.
  return false;
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
/** True if `attacker` lies in the target's front arc (strictly ahead along facing).
 *  Shared by juggernauts and barricades. */
function attackerInFrontArc(targetSq: Square, attacker: Square, targetColor: Color, wide: boolean): boolean {
  const dir = targetColor === "w" ? 1 : -1;
  const tf = wide ? targetSq.c : targetSq.r;
  const af = wide ? attacker.c : attacker.r;
  return (af - tf) * dir > 0;
}
const attackerInJuggFrontArc = attackerInFrontArc;

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
      // Shapeshifter: capturing transforms into the captured piece (no promotion).
      // A non-capturing push to the promotion line promotes like a normal pawn.
      if (isShifter && captured) {
        moves.push({ from, to, piece, captured, ...extra, shapeshiftTo: captured.id });
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
    const { rows, cols } = rowsCols(board);
    // Flight: move to any empty square anywhere on the board (no capture).
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === from.r && c === from.c) continue;
        if (board[r][c]) continue;
        moves.push({ from, to: { r, c }, piece, captured: null, kind: "normal" });
      }
    }
    // Strike: capture an enemy within Chebyshev distance 2, moving onto the square.
    // Cannot jump — straight-line distance-2 strikes are blocked by an intervening piece.
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;
        const to = { r: from.r + dr, c: from.c + dc };
        if (!inBoardBounds(board, to)) continue;
        const t = board[to.r][to.c];
        if (!t || t.color === piece.color || isBarricade(t, state.registry)) continue;
        // Block check: for straight-line distance 2 (same rank/file/diag), the midpoint must be empty.
        const dist = Math.max(Math.abs(dr), Math.abs(dc));
        if (dist === 2) {
          const sameLine = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);
          if (sameLine) {
            const midR = from.r + dr / 2;
            const midC = from.c + dc / 2;
            if (board[midR][midC]) continue; // blocked
          }
        }
        moves.push({ from, to, piece, captured: t, kind: "normal" });
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
        // Immobile pieces (barricades) cannot be teleported.
        if (state.registry[t.id]?.immobile) continue;
        // Juggernauts are too massive to teleport — they cannot be swapped by a portal.
        if (state.registry[t.id]?.special === "juggernaut") continue;
        moves.push({ from, to: { r, c }, piece, captured: null, kind: "portalSwap" });
      }
    }
    return moves;
  }

  if (def.special === "necromancer") {
    // For each adjacent square, only the MOST RECENT corpse matters. If that
    // latest corpse is an "object" (portal, juggernaut, barricade/immobile),
    // the square is not raisable at all — we do NOT fall back to an older
    // corpse underneath it.
    const corpses = state.corpses ?? [];
    const latestBySquare = new Map<string, (typeof corpses)[number]>();
    for (const corp of corpses) {
      const dr = corp.square.r - from.r;
      const dc = corp.square.c - from.c;
      if (dr === 0 && dc === 0) continue;
      if (Math.abs(dr) > 1 || Math.abs(dc) > 1) continue;
      if (board[corp.square.r][corp.square.c]) continue;
      latestBySquare.set(`${corp.square.r},${corp.square.c}`, corp); // later overwrites
    }
    const raiseSquares = new Set<string>();
    for (const corp of latestBySquare.values()) {
      const cdef = state.registry[corp.pieceId];
      if (!cdef) continue;
      if (cdef.special === "juggernaut" || cdef.special === "portal") continue;
      if (cdef.immobile) continue;
      // Raise must consume a matching piece from the graveyard. The
      // graveyard pool that holds the corpse is the OPPOSITE color of its
      // original owner (i.e. captured BY the opponent of the victim).
      const captorColor: "w" | "b" = corp.originalOwner === "w" ? "b" : "w";
      const pool = state.captured[captorColor] ?? [];
      const hasInGraveyard = pool.some(
        (p) => p.id === corp.pieceId && p.color === corp.originalOwner,
      );
      if (!hasInGraveyard) continue;
      raiseSquares.add(`${corp.square.r},${corp.square.c}`);
      moves.push({
        from,
        to: corp.square,
        piece,
        captured: null,
        kind: "necroRaise",
        resurrectPieceId: corp.pieceId,
        resurrectOriginalOwner: corp.originalOwner,
      });
    }
    // Necromancer also moves one square diagonally — and CAN capture an enemy
    // piece on that diagonal square, delivering check/mate like any other piece.
    const diagOffs: Offset[] = [
      { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
    ];
    for (const o of diagOffs) {
      const to = { r: from.r + o.dr, c: from.c + o.dc };
      if (!inBoardBounds(board, to)) continue;
      if (raiseSquares.has(`${to.r},${to.c}`)) continue; // reserved for resurrection
      const t = board[to.r][to.c];
      if (!t) {
        moves.push({ from, to, piece, captured: null });
      } else if (t.color !== piece.color) {
        const tdef = state.registry[t.id];
        if (tdef?.immobile) continue; // barricades etc. cannot be captured
        moves.push({ from, to, piece, captured: t });
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

    // SHIFT ±1 along the perpendicular axis (sideways). May trample enemies
    // on the destination cells (one or both), like a charge but sideways.
    for (const sign of [1, -1]) {
      const dRow = wide ? sign : 0;
      const dCol = wide ? 0 : sign;
      const nF = { r: from.r + dRow, c: from.c + dCol };
      const nP = { r: partner.r + dRow, c: partner.c + dCol };
      if (!inB(nF.r, nF.c) || !inB(nP.r, nP.c)) continue;
      const cellState = (r: number, c: number): "self" | "empty" | "enemy" | "block" => {
        if (isSelfCell(r, c)) return "self";
        const t = board[r][c];
        if (!t) return "empty";
        if (t.color === piece.color) return "block";
        if (state.registry[t.id]?.immobile) return "block";
        return "enemy";
      };
      const sF = cellState(nF.r, nF.c);
      const sP = cellState(nP.r, nP.c);
      if (sF === "block" || sP === "block") continue;
      const trampled: Piece[] = [];
      if (sF === "enemy") trampled.push(board[nF.r][nF.c]!);
      if (sP === "enemy") trampled.push(board[nP.r][nP.c]!);
      moves.push({
        from, to: nF, piece,
        captured: trampled[0] ?? null,
        kind: "juggShift",
        juggTrampled: trampled.length ? trampled : undefined,
      });
    }

    // CHARGE forward — player picks how many squares to advance. Each reachable
    // step emits its own move; tramples accumulate, stops before friendly/barricade,
    // exits off the enemy edge as a juggExit.
    const stepDr = wide ? 0 : dir;
    const stepDc = wide ? dir : 0;
    const trampled: Piece[] = [];
    let curF = { ...from };
    let curP = { ...partner };
    while (true) {
      const nF = { r: curF.r + stepDr, c: curF.c + stepDc };
      const nP = { r: curP.r + stepDr, c: curP.c + stepDc };
      const outF = !inB(nF.r, nF.c);
      const outP = !inB(nP.r, nP.c);
      if (outF && outP) {
        moves.push({
          from, to: { ...from }, piece, captured: null, kind: "juggExit",
          juggTrampled: trampled.length ? [...trampled] : undefined,
        });
        break;
      }
      if (outF || outP) break;
      const t1 = board[nF.r][nF.c];
      const t2 = board[nP.r][nP.c];
      const blocks = (t: Piece | null) =>
        !!t && (t.color === piece.color || isBarricade(t, state.registry));
      if (blocks(t1) || blocks(t2)) break;
      if (t1 && t1.color !== piece.color) trampled.push(t1);
      if (t2 && t2.color !== piece.color) trampled.push(t2);
      curF = nF; curP = nP;
      moves.push({
        from, to: { ...curF }, piece,
        captured: trampled[0] ?? null,
        kind: "juggCharge",
        juggTrampled: trampled.length ? [...trampled] : undefined,
      });
    }
    return moves;
  }

  if (def.special === "assassin") {
    const { rows, cols } = rowsCols(board);
    const inB = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
    const diagDirs: Offset[] = [
      { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
    ];
    const allDirs: Offset[] = [
      { dr: 1, dc: 0 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 0, dc: -1 },
      { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
    ];
    const seen = new Set<string>();
    // Diagonal "stop" squares = 0..2 unobstructed steps. 0 steps means no diagonal portion (still allowed).
    type Stop = { r: number; c: number };
    const stops: Stop[] = [{ r: from.r, c: from.c }];
    for (const d of diagDirs) {
      let r = from.r, c = from.c;
      for (let k = 1; k <= 2; k++) {
        r += d.dr; c += d.dc;
        if (!inB(r, c)) break;
        const occ = board[r][c];
        if (occ) break; // diagonal path must be unobstructed
        stops.push({ r, c });
      }
    }
    for (const s of stops) {
      for (const o of allDirs) {
        const r = s.r + o.dr, c = s.c + o.dc;
        if (!inB(r, c)) continue;
        if (r === from.r && c === from.c) continue; // can't end on own starting square
        const occ = board[r][c];
        if (isBarricade(occ, state.registry)) continue;
        if (occ && occ.color === piece.color) continue;
        const key = `${r},${c}`;
        if (seen.has(key)) continue;
        seen.add(key);
        moves.push({ from, to: { r, c }, piece, captured: occ ?? null });
      }
    }
    return moves;
  }

  if (def.special === "wizard") {
    // Rook-like along its own color (steps of 2 to skip opposite-color
    // squares), PLUS bishop-like diagonals (every diagonal square is the
    // same color, so a normal 1-step slide stays on its color).
    const { rows, cols } = rowsCols(board);
    const inB = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
    // Orthogonal — step by 2, jumping over opposite-color squares/pieces.
    const orthoDirs: Offset[] = [
      { dr: 1, dc: 0 }, { dr: -1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 0, dc: -1 },
    ];
    for (const d of orthoDirs) {
      let r = from.r + 2 * d.dr;
      let c = from.c + 2 * d.dc;
      while (inB(r, c)) {
        const t = board[r][c];
        if (!t) {
          moves.push({ from, to: { r, c }, piece, captured: null });
        } else if (t.color === piece.color) {
          break;
        } else {
          moves.push({ from, to: { r, c }, piece, captured: t });
          break;
        }
        r += 2 * d.dr;
        c += 2 * d.dc;
      }
    }
    // Diagonal — normal bishop slide; stops at the first blocker.
    const diagDirs: Offset[] = [
      { dr: 1, dc: 1 }, { dr: 1, dc: -1 }, { dr: -1, dc: 1 }, { dr: -1, dc: -1 },
    ];
    for (const d of diagDirs) {
      let r = from.r + d.dr;
      let c = from.c + d.dc;
      while (inB(r, c)) {
        const t = board[r][c];
        if (!t) {
          moves.push({ from, to: { r, c }, piece, captured: null });
        } else if (t.color === piece.color) {
          break;
        } else {
          moves.push({ from, to: { r, c }, piece, captured: t });
          break;
        }
        r += d.dr;
        c += d.dc;
      }
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

  // Castling: king moves two squares laterally toward an un-moved rook.
  // Only generated for the side to move — prevents infinite recursion when
  // isSquareAttacked scans the opposing king's pseudo-moves.
  if (def.royal && piece.id === "K" && piece.color === state.turn) {
    const castles = generateCastles(state, from, piece);
    for (const m of castles) moves.push(m);
  }

  return moves;
}

/** Generate castling moves for the given king. Checks: king/rook un-moved,
 *  empty path, king not in check, king does not pass through or land on
 *  an attacked square. */
function generateCastles(state: GameState, from: Square, king: Piece): Move[] {
  const out: Move[] = [];
  const board = state.board;
  const wide = boardIsWide(board);
  const { rows, cols } = rowsCols(board);
  const opp: Color = king.color === "w" ? "b" : "w";

  // Has the king ever moved?
  const kingMoved = state.history.some(
    (m) => m.piece.color === king.color && m.piece.id === "K",
  );
  if (kingMoved) return out;
  if (inCheck(state, king.color)) return out;

  // Castling direction is lateral to pawn movement.
  // Wide boards: pawns push along columns → castle along rows (dr=±1, dc=0).
  // Tall boards: pawns push along rows → castle along columns (dr=0, dc=±1).
  const lateralOffsets: Offset[] = wide
    ? [{ dr: 1, dc: 0 }, { dr: -1, dc: 0 }]
    : [{ dr: 0, dc: 1 }, { dr: 0, dc: -1 }];

  for (const o of lateralOffsets) {
    // Scan outward from the king for a friendly, un-moved rook on the same rank/file.
    let r = from.r + o.dr;
    let c = from.c + o.dc;
    let rookSq: Square | null = null;
    while (r >= 0 && r < rows && c >= 0 && c < cols) {
      const t = board[r][c];
      if (t) {
        if (t.color === king.color && t.id === "R") rookSq = { r, c };
        break;
      }
      r += o.dr;
      c += o.dc;
    }
    if (!rookSq) continue;

    const rookMoved = state.history.some(
      (m) => m.piece.color === king.color && m.piece.id === "R" &&
        m.from && m.from.r === rookSq!.r && m.from.c === rookSq!.c,
    );
    if (rookMoved) continue;

    // Path between king and rook is already empty (loop above). King moves 2
    // toward the rook; rook lands on the square the king passed through.
    const kingTo: Square = { r: from.r + 2 * o.dr, c: from.c + 2 * o.dc };
    const rookTo: Square = { r: from.r + o.dr, c: from.c + o.dc };
    // King must not pass through or land on an attacked square.
    if (isSquareAttacked(state, rookTo, opp)) continue;
    if (isSquareAttacked(state, kingTo, opp)) continue;

    out.push({
      from,
      to: kingTo,
      piece: king,
      captured: null,
      kind: "castle",
      rookFrom: rookSq,
      rookTo,
    });
  }
  return out;
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
  if (move.kind === "castle" && move.from && move.rookFrom && move.rookTo) {
    b[move.from.r][move.from.c] = null;
    b[move.rookFrom.r][move.rookFrom.c] = null;
    b[move.to.r][move.to.c] = { id: move.piece.id, color: move.piece.color };
    b[move.rookTo.r][move.rookTo.c] = { id: "R", color: move.piece.color };
    return b;
  }
  if (move.kind === "portalSwap" && move.from) {
    const friendly = b[move.to.r][move.to.c];
    b[move.to.r][move.to.c] = { id: move.piece.id, color: move.piece.color };
    b[move.from.r][move.from.c] = friendly;
    return b;
  }
  if (move.kind === "resurrect" && move.resurrectPieceId) {
    // Legacy path (graveyard-based resurrect). Necromancer stays.
    b[move.to.r][move.to.c] = { id: move.resurrectPieceId, color: move.piece.color };
    return b;
  }
  if (move.kind === "necroRaise" && move.resurrectPieceId) {
    // Necromancer stays at `from`. New piece appears on the corpse square.
    // Enemy corpse → undead under the necromancer's control. Friendly → restored.
    const isEnemyCorpse =
      !!move.resurrectOriginalOwner && move.resurrectOriginalOwner !== move.piece.color;
    b[move.to.r][move.to.c] = isEnemyCorpse
      ? { id: move.resurrectPieceId, color: move.piece.color, undead: true, raisedOnce: true }
      : { id: move.resurrectPieceId, color: move.piece.color, raisedOnce: true };
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
          // dragon flights land on empty squares (no capture) — not an attack.
          // Dragon strikes carry a captured piece and ARE attacks.
          if (state.registry[p.id]?.special === "dragon" && !m.captured) continue;
          // portal swaps land on friendly squares (never an enemy king square anyway).
          if (m.kind === "portalSwap") continue;
          // resurrect places a friendly piece on an empty square — not an attack.
          if (m.kind === "resurrect" || m.kind === "necroRaise") continue;
          // juggernaut shift/charge are repositioning; trampling captures the cell directly.
          // A charge that lands on `sq` only attacks if `sq` is on the destination row/col,
          // but here `to` IS the destination — so it's a real capture path.
          if (m.kind === "juggShift" || m.kind === "juggExit") continue;
          // castling is not an attack on the king's destination square.
          if (m.kind === "castle") continue;
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
  if (move.captured || move.kind === "resurrect" || move.kind === "necroRaise" || move.juggTrampled) {
    const w = [...state.captured.w];
    const b = [...state.captured.b];
    const targetPool = state.turn === "w" ? w : b;
    // For juggCharge/juggShift, `captured` is also the first entry in juggTrampled — don't double-count.
    if (move.captured && move.kind !== "juggCharge" && move.kind !== "juggShift") {
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
    // necroRaise consumes one matching piece from the graveyard (the pool
    // belonging to the opposite color of the victim's original owner).
    if (move.kind === "necroRaise" && move.resurrectPieceId) {
      const owner = move.resurrectOriginalOwner;
      if (owner) {
        const pool = owner === "w" ? b : w; // captor pool
        const idx = pool.findIndex((p) => p.id === move.resurrectPieceId && p.color === owner);
        if (idx >= 0) pool.splice(idx, 1);
      }
    }
    captured = { w, b };
  }
  // Corpse tracking: only pieces ACTUALLY captured by this move become
  // corpses. (Earlier diff-based tracking incorrectly added "corpses" for
  // pieces that merely moved away from a square.)
  const prevCorpses = state.corpses ?? [];
  let nextCorpses = [...prevCorpses];
  if (move.captured && move.kind !== "necroRaise" && !move.captured.raisedOnce) {
    const sq = move.epCapture ?? move.to;
    nextCorpses.push({ square: sq, pieceId: move.captured.id, originalOwner: move.captured.color });
    // Juggernaut partner also dies on a side/rear capture (see line ~724).
    if (move.captured.id === "J") {
      const part = findJuggPartner(state.board, sq, move.captured.color, state.registry);
      if (part) {
        nextCorpses.push({ square: part, pieceId: "J", originalOwner: move.captured.color });
      }
    }
  }
  // Juggernaut trample: record a corpse on each trampled square along the
  // charge lane (both lead and partner rows/cols).
  if (move.juggTrampled && move.juggTrampled.length && move.from && (move.kind === "juggCharge" || move.kind === "juggExit")) {
    const wide = boardIsWide(state.board);
    const partner = findJuggPartner(state.board, move.from, move.piece.color, state.registry);
    const stepDr = wide ? 0 : (move.piece.color === "w" ? 1 : -1);
    const stepDc = wide ? (move.piece.color === "w" ? 1 : -1) : 0;
    const lanes = partner ? [move.from, partner] : [move.from];
    const { rows, cols } = rowsCols(state.board);
    for (const start of lanes) {
      let cur = { r: start.r + stepDr, c: start.c + stepDc };
      while (cur.r >= 0 && cur.r < rows && cur.c >= 0 && cur.c < cols) {
        const pre = state.board[cur.r][cur.c];
        if (pre && pre.color !== move.piece.color && !pre.raisedOnce) {
          nextCorpses.push({ square: { r: cur.r, c: cur.c }, pieceId: pre.id, originalOwner: pre.color });
        }
        // Stop the lane at the lead's destination row/col (juggExit walks off).
        if (move.kind === "juggCharge" && (cur.r === move.to.r && wide === false) || (wide && cur.c === move.to.c)) break;
        cur = { r: cur.r + stepDr, c: cur.c + stepDc };
      }
    }
  }
  // Juggernaut sideways shift: trampled enemies sit on the two destination cells.
  if (move.juggTrampled && move.juggTrampled.length && move.from && move.kind === "juggShift") {
    const wide = boardIsWide(state.board);
    const partner = findJuggPartner(state.board, move.from, move.piece.color, state.registry);
    const dRow = move.to.r - move.from.r;
    const dCol = move.to.c - move.from.c;
    const cells: Square[] = [{ r: move.to.r, c: move.to.c }];
    if (partner) cells.push({ r: partner.r + dRow, c: partner.c + dCol });
    void wide;
    for (const cell of cells) {
      const pre = state.board[cell.r]?.[cell.c];
      if (pre && pre.color !== move.piece.color && !pre.raisedOnce) {
        nextCorpses.push({ square: cell, pieceId: pre.id, originalOwner: pre.color });
      }
    }
  }
  // necroRaise: the target square is no longer a corpse square — clear ALL
  // corpses there so it cannot be raised from again.
  if (move.kind === "necroRaise") {
    nextCorpses = nextCorpses.filter(
      (cp) => !(cp.square.r === move.to.r && cp.square.c === move.to.c),
    );
  }
  return {
    ...state,
    board,
    reserves,
    captured,
    corpses: nextCorpses,
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
    // Knights leap onto their target — they strike the square directly and
    // bypass front-arc immunity on juggernauts and barricades.
    const attackerBypassesFrontArc = m.piece.id === "N";
    // Front-arc immunity: a juggernaut cannot be captured from the front.
    if (m.captured && m.captured.id === "J" && m.from && !attackerBypassesFrontArc) {
      if (attackerInFrontArc(m.to, m.from, m.captured.color, wide)) return false;
    }
    // Front-arc immunity: a barricade cannot be captured from the front.
    if (m.captured && state.registry[m.captured.id]?.immobile && m.from && !attackerBypassesFrontArc) {
      if (attackerInFrontArc(m.to, m.from, m.captured.color, wide)) return false;
    }
    // Juggernaut charges that would trample a front-protected barricade are also blocked.
    if (m.juggTrampled && m.from) {
      for (const tp of m.juggTrampled) {
        if (state.registry[tp.id]?.immobile) {
          // Determine that trampled barricade's square along the charge path.
          // Simple approximation: if attacker direction matches barricade's color forward, that's its front.
          const dir = m.piece.color === "w" ? 1 : -1;
          const bDir = tp.color === "w" ? 1 : -1;
          if (m.piece.color !== tp.color && dir === -bDir) {
            // Head-on charge attacks the barricade's front → illegal.
            return false;
          }
        }
      }
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
