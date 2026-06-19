/**
 * Open-addressed transposition table for the AI search.
 *
 * - Fixed power-of-two size, indexed by the low bits of the Zobrist key.
 * - Replacement: prefer deeper entries, but always replace stale ones
 *   (older generation). This is the standard "two-tier-ish" scheme but
 *   collapsed to a single slot for simplicity.
 * - Mate scores are stored relative to the current node (`ply` is added
 *   on store and subtracted on probe) so a mate found at one depth
 *   reads correctly at another.
 * - Entries store the best move so subsequent iterations / sibling
 *   nodes get it for free in move ordering.
 *
 * Soundness against collisions: the TT does NOT trust a probe blindly
 * — `search.ts` only uses `entry.best` for ordering if it appears in
 * the legal-move list of the current position, and only returns the
 * cached score when the full 64-bit key matches. A spurious score-
 * return would require a true 64-bit collision (~2^-64 per probe),
 * which we ignore.
 */
import type { Move } from "../types";

export const TT_FLAG_EXACT = 0;
export const TT_FLAG_LOWER = 1; // beta cutoff: score is a lower bound
export const TT_FLAG_UPPER = 2; // failed-low: score is an upper bound

export const MATE_BASE = 100000;
export const MATE_THRESHOLD = MATE_BASE - 1000; // |score| >= threshold ⇒ treat as mate

export interface TTEntry {
  key: bigint;
  depth: number;
  score: number;
  flag: 0 | 1 | 2;
  best: Move | null;
  age: number;
}

export interface TTStats {
  hits: number;
  stores: number;
  cutoffs: number;
  collisions: number;
  fillPct: number;
  size: number;
}

export class TT {
  readonly size: number;
  private readonly mask: bigint;
  private readonly keys: BigUint64Array;
  private readonly depths: Int8Array;
  private readonly scores: Int32Array;
  private readonly flags: Uint8Array;
  private readonly ages: Uint16Array;
  private readonly bests: (Move | null)[];

  private age = 1;
  private occupied = 0;
  hits = 0;
  stores = 0;
  cutoffs = 0;
  collisions = 0;

  constructor(sizePow2 = 1 << 18) {
    if ((sizePow2 & (sizePow2 - 1)) !== 0) {
      throw new Error("TT size must be a power of two");
    }
    this.size = sizePow2;
    this.mask = BigInt(sizePow2 - 1);
    this.keys = new BigUint64Array(sizePow2);
    this.depths = new Int8Array(sizePow2);
    this.scores = new Int32Array(sizePow2);
    this.flags = new Uint8Array(sizePow2);
    this.ages = new Uint16Array(sizePow2);
    this.bests = new Array(sizePow2).fill(null);
  }

  /** Bump generation. Call once at the start of every root search. */
  newGeneration(): void {
    this.age = (this.age + 1) & 0xffff || 1;
  }

  /** Reset counters between searches (not entries). */
  resetCounters(): void {
    this.hits = 0;
    this.stores = 0;
    this.cutoffs = 0;
    this.collisions = 0;
  }

  /** Wipe everything. Call when the variant salt changes. */
  clear(): void {
    this.keys.fill(0n);
    this.depths.fill(0);
    this.scores.fill(0);
    this.flags.fill(0);
    this.ages.fill(0);
    for (let i = 0; i < this.size; i++) this.bests[i] = null;
    this.age = 1;
    this.occupied = 0;
    this.resetCounters();
  }

  probe(key: bigint): TTEntry | null {
    const i = Number(key & this.mask);
    const k = this.keys[i];
    if (k === 0n) return null;
    if (k !== key) return null; // collision-in-bucket; treat as miss
    this.hits++;
    return {
      key,
      depth: this.depths[i],
      score: this.scores[i],
      flag: this.flags[i] as 0 | 1 | 2,
      best: this.bests[i],
      age: this.ages[i],
    };
  }

  store(key: bigint, depth: number, score: number, flag: 0 | 1 | 2, best: Move | null, ply: number): void {
    const i = Number(key & this.mask);
    const existed = this.keys[i] !== 0n;
    const sameSlot = existed && this.keys[i] === key;
    if (existed && !sameSlot) {
      // Replacement policy: replace if old is stale OR new is at least as deep.
      const oldStale = this.ages[i] !== this.age;
      if (!oldStale && depth < this.depths[i]) return;
    }
    // Mate-distance encoding: store distance from this node.
    let adj = score;
    if (adj > MATE_THRESHOLD) adj = adj + ply;
    else if (adj < -MATE_THRESHOLD) adj = adj - ply;
    if (adj > 0x7fffffff) adj = 0x7fffffff;
    if (adj < -0x80000000) adj = -0x80000000;

    this.keys[i] = key;
    this.depths[i] = Math.max(-128, Math.min(127, depth | 0));
    this.scores[i] = adj | 0;
    this.flags[i] = flag;
    this.bests[i] = best;
    this.ages[i] = this.age;
    if (!existed) this.occupied++;
    this.stores++;
  }

  /** Convert a stored mate score back to "mate from root" at `ply`. */
  adjustMateForRead(score: number, ply: number): number {
    if (score > MATE_THRESHOLD) return score - ply;
    if (score < -MATE_THRESHOLD) return score + ply;
    return score;
  }

  recordCutoff(): void { this.cutoffs++; }
  recordCollision(): void { this.collisions++; }

  stats(): TTStats {
    return {
      hits: this.hits,
      stores: this.stores,
      cutoffs: this.cutoffs,
      collisions: this.collisions,
      fillPct: this.size > 0 ? (this.occupied / this.size) * 100 : 0,
      size: this.size,
    };
  }
}
