/**
 * Zobrist hashing for the AI transposition table.
 *
 * Design choices that matter for Prism Chess:
 *
 * 1. Keys are bigints. JS has no native u64, and the perf cost of bigint
 *    XOR is dominated by the rest of the search per-node work (move
 *    generation + applyMoveToState + evaluate). Microbenches showed
 *    bigint hashing adds <5% to wall time.
 *
 * 2. The key table is LAZY and SALTED. Piece ids are dynamic ("u:<slug>",
 *    plus built-ins), so keys are generated the first time a (piece,
 *    color, undead, r, c) tuple is seen. A per-variant salt — derived
 *    from rows × cols × the registry of piece ids/specials — is folded
 *    into every key, so two different variants live in disjoint key
 *    spaces and can't collide in the TT.
 *
 * 3. We hash everything that affects legality OR evaluation:
 *      - board (piece id, color, undead flag)
 *      - side to move
 *      - en passant target
 *      - pendingHand (King's Hand mid-double-move)
 *      - corpses (Necromancer raise targets)
 *      - reserves (drops)
 *    We deliberately do NOT hash `history`, `captured`, or `raisedOnce`
 *    on live pieces — they don't change current legality, and including
 *    history would destroy almost every transposition.
 *
 * 4. The next-state key is computed INCREMENTALLY by diffing prev vs
 *    next: a handful of XORs per node instead of re-walking the whole
 *    board. A from-scratch verifier is provided for debug mode (see
 *    search.ts) so a bug in the diff path is caught instantly.
 */
import type { Color, Corpse, GameState, PieceId, Square } from "../types";

/* ------------------------------------------------------------------ */
/* Seeded PRNG — SplitMix64.                                          */
/* ------------------------------------------------------------------ */

const MASK64 = (1n << 64n) - 1n;

function splitmix64(seed: bigint): () => bigint {
  let s = seed & MASK64;
  return () => {
    s = (s + 0x9e3779b97f4a7c15n) & MASK64;
    let z = s;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return (z ^ (z >> 31n)) & MASK64;
  };
}

/* ------------------------------------------------------------------ */
/* Per-variant salt + key cache.                                      */
/*                                                                    */
/* The key cache is module-global but partitioned by salt: each cache */
/* entry is keyed `${salt}|${componentKey}`. Since one worker handles */
/* one variant for the duration of a search (the worker resets it on  */
/* every message), this is effectively per-variant.                   */
/* ------------------------------------------------------------------ */

const keyCache = new Map<string, bigint>();

/** Build a stable salt for a (rows, cols, registry) tuple. */
export function computeVariantSalt(state: GameState): bigint {
  const ids = Object.keys(state.registry).sort();
  const sigParts: string[] = [`${state.rows}x${state.cols}`];
  for (const id of ids) {
    const def = state.registry[id];
    sigParts.push(`${id}:${def?.special ?? ""}:${def?.royal ? "R" : ""}:${def?.immobile ? "I" : ""}`);
  }
  const sig = sigParts.join("|");
  // FNV-1a-ish over the signature to seed splitmix64.
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < sig.length; i++) {
    h = ((h ^ BigInt(sig.charCodeAt(i))) * 0x100000001b3n) & MASK64;
  }
  // One more splitmix step for good measure.
  return splitmix64(h)();
}

function keyFor(salt: bigint, component: string): bigint {
  const cacheKey = `${salt.toString(16)}|${component}`;
  const hit = keyCache.get(cacheKey);
  if (hit !== undefined) return hit;
  // Derive deterministically from (salt, component) so the same component
  // always gets the same key regardless of cache state.
  let h = salt;
  for (let i = 0; i < component.length; i++) {
    h = (h ^ BigInt(component.charCodeAt(i))) & MASK64;
    h = (h * 0x100000001b3n) & MASK64;
  }
  const k = splitmix64(h)();
  keyCache.set(cacheKey, k);
  return k;
}

/* ------------------------------------------------------------------ */
/* Component-key helpers.                                             */
/* ------------------------------------------------------------------ */

function pieceSquareKey(
  salt: bigint,
  id: PieceId,
  color: Color,
  undead: boolean,
  r: number,
  c: number,
): bigint {
  return keyFor(salt, `p|${id}|${color}|${undead ? "u" : "n"}|${r},${c}`);
}

function epKey(salt: bigint, sq: Square): bigint {
  return keyFor(salt, `ep|${sq.r},${sq.c}`);
}

function handKey(salt: bigint, sq: Square): bigint {
  return keyFor(salt, `hand|${sq.r},${sq.c}`);
}

function turnBlackKey(salt: bigint): bigint {
  return keyFor(salt, "turn|b");
}

function corpseKey(salt: bigint, c: Corpse): bigint {
  return keyFor(salt, `corpse|${c.pieceId}|${c.originalOwner}|${c.square.r},${c.square.c}`);
}

function reserveKey(salt: bigint, color: Color, id: PieceId, count: number): bigint {
  // count===0 contributes nothing; clamp range so a runaway count can't
  // create an unbounded number of keys.
  const n = Math.max(0, Math.min(255, count | 0));
  return keyFor(salt, `res|${color}|${id}|${n}`);
}

/* ------------------------------------------------------------------ */
/* Full computation (canonical reference; used as verifier).          */
/* ------------------------------------------------------------------ */

export function computeZobristFromScratch(state: GameState, salt: bigint): bigint {
  let k = 0n;
  const board = state.board;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const p = board[r][c];
      if (!p) continue;
      k ^= pieceSquareKey(salt, p.id, p.color, !!p.undead, r, c);
    }
  }
  if (state.turn === "b") k ^= turnBlackKey(salt);
  if (state.enPassant) k ^= epKey(salt, state.enPassant);
  if (state.pendingHand) k ^= handKey(salt, state.pendingHand);
  for (const c of state.corpses) k ^= corpseKey(salt, c);
  for (const color of ["w", "b"] as const) {
    const res = state.reserves[color];
    for (const id of Object.keys(res)) {
      const n = res[id] | 0;
      if (n > 0) k ^= reserveKey(salt, color, id, n);
    }
  }
  return k & MASK64;
}

/* ------------------------------------------------------------------ */
/* Incremental update: derive next-state key by diffing prev → next.  */
/*                                                                    */
/* This is correct for ALL move kinds (portal swap, necromancer       */
/* raise, juggernaut charge, shadow link, etc.) because it works      */
/* purely from board / corpse / reserve / meta deltas — no per-       */
/* movekind branching that could go stale.                            */
/* ------------------------------------------------------------------ */

export function zkeyAfter(
  prevKey: bigint,
  prev: GameState,
  next: GameState,
  salt: bigint,
): bigint {
  let k = prevKey;

  // Turn
  if (prev.turn !== next.turn) k ^= turnBlackKey(salt);

  // Board diff
  const rows = next.board.length;
  for (let r = 0; r < rows; r++) {
    const prowLen = prev.board[r]?.length ?? 0;
    const nrow = next.board[r];
    for (let c = 0; c < nrow.length; c++) {
      const a = c < prowLen ? prev.board[r][c] : null;
      const b = nrow[c];
      if (a === b) continue;
      if (a && b && a.id === b.id && a.color === b.color && !!a.undead === !!b.undead) continue;
      if (a) k ^= pieceSquareKey(salt, a.id, a.color, !!a.undead, r, c);
      if (b) k ^= pieceSquareKey(salt, b.id, b.color, !!b.undead, r, c);
    }
  }

  // En passant
  const epEq = sameSquare(prev.enPassant, next.enPassant);
  if (!epEq) {
    if (prev.enPassant) k ^= epKey(salt, prev.enPassant);
    if (next.enPassant) k ^= epKey(salt, next.enPassant);
  }

  // Pending hand
  const handEq = sameSquare(prev.pendingHand ?? null, next.pendingHand ?? null);
  if (!handEq) {
    if (prev.pendingHand) k ^= handKey(salt, prev.pendingHand);
    if (next.pendingHand) k ^= handKey(salt, next.pendingHand);
  }

  // Corpses (set diff by signature)
  const prevCorpseSigs = new Map<string, Corpse>();
  for (const c of prev.corpses) prevCorpseSigs.set(corpseSig(c), c);
  const nextCorpseSigs = new Map<string, Corpse>();
  for (const c of next.corpses) nextCorpseSigs.set(corpseSig(c), c);
  for (const [sig, c] of prevCorpseSigs) {
    if (!nextCorpseSigs.has(sig)) k ^= corpseKey(salt, c);
  }
  for (const [sig, c] of nextCorpseSigs) {
    if (!prevCorpseSigs.has(sig)) k ^= corpseKey(salt, c);
  }

  // Reserves diff per color × piece id.
  for (const color of ["w", "b"] as const) {
    const pa = prev.reserves[color] ?? {};
    const na = next.reserves[color] ?? {};
    const ids = new Set([...Object.keys(pa), ...Object.keys(na)]);
    for (const id of ids) {
      const pc = pa[id] | 0;
      const nc = na[id] | 0;
      if (pc === nc) continue;
      if (pc > 0) k ^= reserveKey(salt, color, id, pc);
      if (nc > 0) k ^= reserveKey(salt, color, id, nc);
    }
  }

  return k & MASK64;
}

function sameSquare(a: Square | null | undefined, b: Square | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.r === b.r && a.c === b.c;
}

function corpseSig(c: Corpse): string {
  return `${c.pieceId}|${c.originalOwner}|${c.square.r},${c.square.c}`;
}

/** Wipe the lazy key cache. Worker calls this when the variant salt
 *  changes so we don't grow keys for variants we'll never see again. */
export function resetZobristKeyCache(): void {
  keyCache.clear();
}
