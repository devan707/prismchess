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

/** True for board fixtures (currently: the Prism) — impassable AND uncapturable.
 *  Sliders must stop BEFORE one. Leapers/pawns/dragons cannot capture one.
 *  Drops, portal swaps, and necromancer raises cannot target one. */
function isFixture(p: Piece | null, registry: Record<PieceId, PieceDef>): boolean {
  return !!p && registry[p.id]?.special === "prism";
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
    if (isFixture(occ, registry)) return false;
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
        if (isFixture(t, registry)) break;
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
        if (t && t.color !== piece.color && !isBarricade(t, state.registry) && !isFixture(t, state.registry)) {
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
        if (t && t.color !== piece.color && !isBarricade(t, state.registry) && !isFixture(t, state.registry)) {
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
    // Strike: capture an enemy within range — 1 or 2 squares orthogonally
    // OR 1 or 2 squares diagonally. Knight-style (1,2)/(2,1) offsets are NOT
    // allowed. Distance-2 strikes are blocked by an intervening piece.
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;
        const isOrth = dr === 0 || dc === 0;
        const isDiag = Math.abs(dr) === Math.abs(dc);
        if (!isOrth && !isDiag) continue; // reject knight-style offsets
        const to = { r: from.r + dr, c: from.c + dc };
        if (!inBoardBounds(board, to)) continue;
        const t = board[to.r][to.c];
        if (!t || t.color === piece.color || isBarricade(t, state.registry) || isFixture(t, state.registry)) continue;
        const dist = Math.max(Math.abs(dr), Math.abs(dc));
        if (dist === 2) {
          const midR = from.r + dr / 2;
          const midC = from.c + dc / 2;
          if (board[midR][midC]) continue; // blocked by intervening piece
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

    // SHIFT ±1 along the perpendicular axis (sideways). One destination cell
    // is the partner's just-vacated square (always passable); the OTHER is the
    // "leading" cell and may be empty (reposition) or hold a single enemy that
    // gets trampled (lateral attack). Friendly pieces, barricades, and
    // fixtures still block the shift entirely.
    for (const sign of [1, -1]) {
      const dRow = wide ? sign : 0;
      const dCol = wide ? 0 : sign;
      const nF = { r: from.r + dRow, c: from.c + dCol };
      const nP = { r: partner.r + dRow, c: partner.c + dCol };
      if (!inB(nF.r, nF.c) || !inB(nP.r, nP.c)) continue;
      const trampled: Piece[] = [];
      let blocked = false;
      for (const cell of [nF, nP]) {
        if (isSelfCell(cell.r, cell.c)) continue;
        const occ = board[cell.r][cell.c];
        if (!occ) continue;
        if (occ.color === piece.color || isBarricade(occ, state.registry) || isFixture(occ, state.registry)) {
          blocked = true; break;
        }
        trampled.push(occ);
      }
      if (blocked) continue;
      moves.push({
        from, to: nF, piece,
        captured: trampled[0] ?? null,
        kind: "juggShift",
        juggTrampled: trampled.length ? trampled : undefined,
      });
    }

    // CHARGE forward — player picks how many squares to advance (1..5).
    // Each reachable step emits its own move; tramples accumulate, stops
    // before friendly/barricade. Cannot exit the board.
    const MAX_CHARGE = 5;
    const stepDr = wide ? 0 : dir;
    const stepDc = wide ? dir : 0;
    const trampled: Piece[] = [];
    let curF = { ...from };
    let curP = { ...partner };
    for (let step = 1; step <= MAX_CHARGE; step++) {
      const nF = { r: curF.r + stepDr, c: curF.c + stepDc };
      const nP = { r: curP.r + stepDr, c: curP.c + stepDc };
      if (!inB(nF.r, nF.c) || !inB(nP.r, nP.c)) break;
      const t1 = board[nF.r][nF.c];
      const t2 = board[nP.r][nP.c];
      const blocks = (t: Piece | null) =>
        !!t && (t.color === piece.color || isBarricade(t, state.registry) || isFixture(t, state.registry));
      if (blocks(t1) || blocks(t2)) break;
      if (t1 && t1.color !== piece.color && !isFixture(t1, state.registry)) trampled.push(t1);
      if (t2 && t2.color !== piece.color && !isFixture(t2, state.registry)) trampled.push(t2);
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
    // Assassin: a single 3-step infiltration per turn.
    //   • All 4 path squares (start + 3 landings) must be distinct.
    //   • The first 2 landing squares must be empty (no jumping).
    //   • The 3rd/final square may be empty or hold an enemy — capture
    //     happens only on the final step.
    //   • The 3 step directions cannot ALL be the same (no straight line of 3).
    //   • Between consecutive steps the turn must be ≤ 45° — each new
    //     step direction is the same as, or adjacent to, the previous one
    //     on the 8-direction compass.
    //   • The Assassin CANNOT move or capture on adjacent squares; the
    //     final landing must be at least 2 squares (Chebyshev) from start.
    const { rows, cols } = rowsCols(board);
    const inB = (r: number, c: number) => r >= 0 && r < rows && c >= 0 && c < cols;
    // Compass order (clockwise from N) — adjacent indices are 45° apart.
    const DIRS_8: Offset[] = [
      { dr: -1, dc:  0 }, // 0: N
      { dr: -1, dc:  1 }, // 1: NE
      { dr:  0, dc:  1 }, // 2: E
      { dr:  1, dc:  1 }, // 3: SE
      { dr:  1, dc:  0 }, // 4: S
      { dr:  1, dc: -1 }, // 5: SW
      { dr:  0, dc: -1 }, // 6: W
      { dr: -1, dc: -1 }, // 7: NW
    ];
    const finals = new Map<string, Piece | null>();

    const turnOK = (prevIdx: number, nextIdx: number) => {
      const d = Math.abs(prevIdx - nextIdx);
      return d <= 1 || d === 7; // 7 ↔ 0 wraparound = also 45°
    };
    const visited = new Set<string>();
    visited.add(`${from.r},${from.c}`);
    const dirIdxHistory: number[] = [];

    const walk = (r: number, c: number, depth: number) => {
      if (depth === 3) return;
      for (let i = 0; i < 8; i++) {
        if (dirIdxHistory.length > 0 &&
            !turnOK(dirIdxHistory[dirIdxHistory.length - 1], i)) continue;
        const d = DIRS_8[i];
        const nr = r + d.dr;
        const nc = c + d.dc;
        if (!inB(nr, nc)) continue;
        const key = `${nr},${nc}`;
        if (visited.has(key)) continue;
        const occ = board[nr][nc];
        const isFinal = depth === 2;
        if (!isFinal) {
          if (occ) continue;
        } else {
          if (isBarricade(occ, state.registry)) continue;
          if (isFixture(occ, state.registry)) continue;
          if (occ && occ.color === piece.color) continue;
          if (dirIdxHistory.length === 2 &&
              dirIdxHistory[0] === i && dirIdxHistory[1] === i) continue;
          // Assassin cannot end its 3-step infiltration on a square adjacent
          // to its starting square — no king-step attacks/moves.
          if (Math.max(Math.abs(nr - from.r), Math.abs(nc - from.c)) <= 1) continue;
          const prev = finals.get(key);
          if (prev === undefined || (prev === null && occ)) {
            finals.set(key, occ ?? null);
          }
          continue;
        }
        visited.add(key);
        dirIdxHistory.push(i);
        walk(nr, nc, depth + 1);
        dirIdxHistory.pop();
        visited.delete(key);
      }
    };
    walk(from.r, from.c, 0);

    for (const [key, captured] of finals) {
      const [rStr, cStr] = key.split(",");
      moves.push({
        from,
        to: { r: Number(rStr), c: Number(cStr) },
        piece,
        captured,
      });
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
        } else if (t.color === piece.color || isFixture(t, state.registry)) {
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
        } else if (t.color === piece.color || isFixture(t, state.registry)) {
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

  // King's Hand combo step: a single 2-square king-line move that counts as
  // both of its required turn-steps. Only generated when no pending second
  // move is owed (otherwise the second step is a normal 1-square leap).
  // Requires the intermediate square to be empty and the landing square to
  // be empty or hold a capturable enemy.
  if (piece.id === "H" && !state.pendingHand) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const midR = from.r + dr, midC = from.c + dc;
        const toR = from.r + 2 * dr, toC = from.c + 2 * dc;
        if (!inBoardBounds(board, { r: toR, c: toC })) continue;
        const mid = board[midR][midC];
        if (mid) continue; // path must be unobstructed
        const t = board[toR][toC];
        if (t && (t.color === piece.color || isBarricade(t, state.registry) || isFixture(t, state.registry))) continue;
        moves.push({ from, to: { r: toR, c: toC }, piece, captured: t ?? null, kind: "handDouble" });
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
    // Barricades may only be dropped directly in front of a friendly piece
    // (one square forward from that piece's perspective).
    const barricadeOnly = id === "X";
    const dir = pawnDir(color);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (state.board[r][c]) continue;
        if (barricadeOnly) {
          const br = r - dir;
          if (br < 0 || br >= rows) continue;
          const behind = state.board[br][c];
          if (!behind || behind.color !== color) continue;
        }
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
  if (move.kind === "handPass") {
    // Turn-ending no-op when the King's Hand has no legal second step.
    return b;
  }
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
/**
 * Every square the piece at `from` threatens — i.e. every square it could
 * capture an enemy on if one were standing there. Used by the Board UI to
 * paint "attackable" squares orange (vs green move-only squares). For a
 * dragon this differs from its move pattern: flights to empty squares are
 * not attacks, but the strike pattern over empty squares still threatens.
 */
export function attackSquaresFrom(state: GameState, from: Square): Square[] {
  const piece = state.board[from.r]?.[from.c];
  if (!piece) return [];
  const victimColor: Color = piece.color === "w" ? "b" : "w";
  const rows = state.board.length;
  const cols = state.board[0]?.length ?? 0;
  const out: Square[] = [];
  // For the side to move, probe with the full legality filter so we don't
  // paint orange "threat" dots on squares the piece can't actually reach
  // (e.g. a pinned assassin / dragon / archer). For enemy inspection we
  // still show the raw pseudo threat pattern.
  const useLegal = piece.color === state.turn && !state.pendingHand;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === from.r && c === from.c) continue;
      const probeBoard = state.board.map((row, ri) =>
        ri === r
          ? row.map((cell, ci) => (ci === c ? ({ id: "P", color: victimColor } as Piece) : cell))
          : row,
      );
      const probeState = { ...state, board: probeBoard } as GameState;
      const moves = useLegal
        ? legalMovesFrom(probeState, from)
        : pseudoMovesFrom(probeState, from);
      const hits = moves.some((m) => {
        if (m.to.r !== r || m.to.c !== c) return false;
        if (!m.captured) return false;
        if (m.kind === "portalSwap" || m.kind === "resurrect" || m.kind === "necroRaise") return false;
        if (m.kind === "juggShift" || m.kind === "juggExit") return false;
        return true;
      });
      if (hits) out.push({ r, c });
    }
  }
  return out;
}

export function isSquareAttacked(state: GameState, sq: Square, byColor: Color): boolean {
  const board = state.board;
  const aura = prismAuraCells(board, state.registry);
  const hasAura = aura.size > 0;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const p = board[r][c];
      if (!p || p.color !== byColor) continue;
      const moves = pseudoMovesFrom(state, { r, c });
      for (const m of moves) {
        if (m.to.r === sq.r && m.to.c === sq.c && m.kind !== "drop") {
          if (state.registry[p.id]?.special === "dragon" && !m.captured) continue;
          if (m.kind === "portalSwap") continue;
          if (m.kind === "resurrect" || m.kind === "necroRaise") continue;
          if (m.kind === "juggExit") continue;
          if (m.kind === "castle") continue;
          // Prism cancels attacks only when the attacker would flip color
          // BEFORE reaching `sq` — i.e. it crosses an aura square on the
          // way in (and didn't already start inside the aura). A royal
          // standing inside the aura still dies on capture, because the
          // king is removed before the end-of-turn prism sweep flips the
          // attacker. Landing-in-aura alone does not cancel the threat.
          if (hasAura && m.from) {
            const dr = m.to.r - m.from.r;
            const dc = m.to.c - m.from.c;
            const aR = Math.abs(dr), aC = Math.abs(dc);
            const linear = aR === 0 || aC === 0 || aR === aC;
            if (linear) {
              const steps = Math.max(aR, aC);
              const sR = steps ? dr / steps : 0;
              const sC = steps ? dc / steps : 0;
              const startedInAura = aura.has(`${m.from.r},${m.from.c}`);
              let crossed = false;
              for (let s = 1; s < steps; s++) {
                if (aura.has(`${m.from.r + s * sR},${m.from.c + s * sC}`)) { crossed = true; break; }
              }
              if (!startedInAura && crossed) continue;
            }
          }
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
  // King's Hand makes two king-steps per turn. The first move keeps the
  // turn with the same player; the second (or a handPass) flips it. End-of-
  // turn effects (prism aura sweep, enPassant clearing) only run when the
  // turn actually flips.
  const isHand = move.piece.id === "H" && (move.kind === "normal" || move.kind === undefined);
  const wasPending = !!state.pendingHand;
  const isFirstHandMove = isHand && !wasPending;
  const flipTurn = !isFirstHandMove;
  const nextPendingHand = isFirstHandMove ? { r: move.to.r, c: move.to.c } : null;
  const next: GameState = {
    ...state,
    board,
    reserves,
    captured,
    corpses: nextCorpses,
    enPassant: flipTurn
      ? (move.kind === "double" && move.from
          ? (move.from.r !== move.to.r
              ? { r: (move.from.r + move.to.r) / 2, c: move.from.c }
              : { r: move.from.r, c: (move.from.c + move.to.c) / 2 })
          : null)
      : state.enPassant,
    turn: flipTurn ? (state.turn === "w" ? "b" : "w") : state.turn,
    pendingHand: nextPendingHand,
  };
  applyPrismFlips(next.board, move, state.registry, flipTurn);
  return next;
}

/** PRISM EFFECTS — flip non-royal pieces that pass through or sit in the
 *  rainbow aura around any Prism. Mutates `board` in place. */
function prismAuraCells(board: Board, registry: Record<PieceId, PieceDef>): Set<string> {
  const aura = new Set<string>();
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = board[r][c];
      if (!p || registry[p.id]?.special !== "prism") continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const o = board[nr][nc];
          if (o && registry[o.id]?.special === "prism") continue;
          aura.add(`${nr},${nc}`);
        }
      }
    }
  }
  return aura;
}

function flipPieceAt(board: Board, r: number, c: number, registry: Record<PieceId, PieceDef>) {
  const p = board[r][c];
  if (!p) return;
  const d = registry[p.id];
  if (!d) return;
  if (d.royal) return;
  if (d.special === "prism") return;
  if (d.special === "juggernaut") return; // pair would desync
  if (d.special === "portal") return;
  if (d.special === "wizard") return;
  if (d.special === "necromancer") return;
  board[r][c] = { ...p, color: p.color === "w" ? "b" : "w" };
}

function applyPrismFlips(board: Board, move: Move, registry: Record<PieceId, PieceDef>, endOfTurn: boolean = true) {
  const aura = prismAuraCells(board, registry);
  if (aura.size === 0) return;
  const inAura = (r: number, c: number) => aura.has(`${r},${c}`);
  // Pass-through flip on a linear move that crossed the aura and ended
  // outside it. Always applies (even on the King's Hand first step), but
  // a 1-square king leap never has intermediate squares so this is a no-op
  // for KH in practice.
  if (move.from && move.kind !== "drop" && move.kind !== "portalSwap" &&
      move.kind !== "necroRaise" && move.kind !== "resurrect" &&
      move.kind !== "handPass" &&
      move.kind !== "juggShift" && move.kind !== "juggCharge" && move.kind !== "juggExit") {
    const dr = move.to.r - move.from.r;
    const dc = move.to.c - move.from.c;
    const aR = Math.abs(dr), aC = Math.abs(dc);
    const linear = aR === 0 || aC === 0 || aR === aC;
    if (linear) {
      const steps = Math.max(aR, aC);
      const sR = steps ? dr / steps : 0;
      const sC = steps ? dc / steps : 0;
      // If the piece STARTED inside the aura, it's already been claimed
      // by the prism on a previous turn — moving out (even through other
      // aura squares) should not re-flip it.
      const startedInAura = inAura(move.from.r, move.from.c);
      let crossed = false;
      for (let s = 1; s < steps; s++) {
        if (inAura(move.from.r + s * sR, move.from.c + s * sC)) { crossed = true; break; }
      }
      if (!startedInAura && crossed && !inAura(move.to.r, move.to.c)) {
        flipPieceAt(board, move.to.r, move.to.c, registry);
      }
    }
  }
  // End-of-turn sweep — only when the turn actually ends.
  if (!endOfTurn) return;
  for (const key of aura) {
    const [r, c] = key.split(",").map(Number);
    flipPieceAt(board, r, c, registry);
  }
}

export function legalMovesFrom(state: GameState, from: Square): Move[] {
  const p = state.board[from.r][from.c];
  if (!p || p.color !== state.turn) return [];
  // King's Hand mid-turn lock: only the KH that just moved may move, and
  // only with another single king-step.
  if (state.pendingHand) {
    if (from.r !== state.pendingHand.r || from.c !== state.pendingHand.c) return [];
    if (p.id !== "H") return [];
  }
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
          const dir = m.piece.color === "w" ? 1 : -1;
          const bDir = tp.color === "w" ? 1 : -1;
          if (m.piece.color !== tp.color && dir === -bDir) {
            return false;
          }
        }
      }
    }
    if (m.juggTrampled && m.juggTrampled.some((p) => p.id === "J") && m.from) {
      const enemyColor = m.juggTrampled.find((p) => p.id === "J")!.color;
      const dir = m.piece.color === "w" ? 1 : -1;
      if (m.piece.color !== enemyColor && dir === (enemyColor === "w" ? 1 : -1)) {
        return false;
      }
      if (m.piece.color !== enemyColor) return false;
    }
    // First-of-two King's Hand move: defer own-king safety to the second
    // step. Otherwise enforce it now (board pre-prism-flip).
    const isFirstHand = !state.pendingHand && m.piece.id === "H" && m.kind !== "handDouble";
    if (isFirstHand) return true;
    const preFlipBoard = applyMoveToBoard(state.board, m);
    return !inCheck({ ...state, board: preFlipBoard }, state.turn);
  });
}

export function allLegalMoves(state: GameState): Move[] {
  const out: Move[] = [];
  if (state.pendingHand) {
    const ph = state.pendingHand;
    out.push(...legalMovesFrom(state, ph));
    // If the KH has no legal second step (extremely rare — surrounded), allow
    // a forced pass so the turn can still end.
    if (out.length === 0) {
      const p = state.board[ph.r]?.[ph.c];
      if (p && p.id === "H" && p.color === state.turn) {
        out.push({ from: ph, to: ph, piece: p, kind: "handPass" });
      }
    }
    return out;
  }
  for (let r = 0; r < state.board.length; r++) {
    for (let c = 0; c < state.board[0].length; c++) {
      const p = state.board[r][c];
      if (!p || p.color !== state.turn) continue;
      out.push(...legalMovesFrom(state, { r, c }));
    }
  }
  // Drops
  for (const m of dropMoves(state, state.turn)) {
    const preFlipBoard = applyMoveToBoard(state.board, m);
    if (!inCheck({ ...state, board: preFlipBoard }, state.turn)) out.push(m);
  }
  return out;
}

export { applyMoveToState };
