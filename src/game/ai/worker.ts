/// <reference lib="webworker" />
/**
 * AI worker entry. Receives a GameState + difficulty + playbook snapshot,
 * runs an iterative-deepening search, posts the chosen move back.
 *
 * Important: the playbook snapshot must come in from the main thread —
 * Workers have no window/localStorage, so reading the playbook directly
 * here would always yield defaults. See playbook.ts setActivePlaybookSnapshot.
 *
 * The worker owns one TranspositionTable. We keep it across messages so
 * iterative-deepening between successive moves of the same game reuses
 * cached scores. The table is wiped when the variant salt changes.
 */
import { runSearch, paramsFor, type SearchResult } from "./search";
import type { Difficulty, GameState, Move } from "../types";
import { setActivePlaybookSnapshot, type Playbook } from "./playbook";
import { TT, type TTStats } from "./tt";
import { computeVariantSalt, resetZobristKeyCache } from "./zobrist";
import type { CandidateAnalysis } from "./safety";

export type WorkerRequest = {
  type: "search";
  id: number;
  state: GameState;
  difficulty: Difficulty;
  playbook?: Playbook | null;
  /** When true the search verifies Zobrist incrementally and disables TT
   *  on mismatch. Off in production; on when the user enables AI debug. */
  verifyZobrist?: boolean;
};

export interface SearchStatsPayload {
  depthReached: number;
  nodes: number;
  elapsedMs: number;
  score: number;
  tt: TTStats;
  zobristFailed: boolean;
  pv: Move[];
}

export type WorkerResponse =
  | { type: "result"; id: number; move: Move | null; stats: SearchStatsPayload }
  | { type: "error"; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// One TT, lazily allocated. Wiped when the variant salt changes.
let tt: TT | null = null;
let currentSalt: bigint | null = null;

function ttFor(state: GameState): TT {
  const salt = computeVariantSalt(state);
  if (!tt || currentSalt !== salt) {
    if (tt) tt.clear();
    else tt = new TT(1 << 18); // ~262k entries
    currentSalt = salt;
    // The Zobrist key cache is partitioned by salt so old entries become
    // garbage when the variant changes — drop them to free memory.
    resetZobristKeyCache();
  }
  return tt;
}

ctx.addEventListener("message", (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg?.type !== "search") return;
  try {
    setActivePlaybookSnapshot(msg.playbook ?? null);
    const params = paramsFor(msg.state, msg.difficulty);
    const result: SearchResult = runSearch(msg.state, {
      difficulty: msg.difficulty,
      ...params,
      tt: ttFor(msg.state),
      verifyZobrist: !!msg.verifyZobrist,
    });
    const out: WorkerResponse = {
      type: "result",
      id: msg.id,
      move: result.move,
      stats: {
        depthReached: result.depthReached,
        nodes: result.nodes,
        elapsedMs: result.elapsedMs,
        score: result.score,
        tt: result.tt,
        zobristFailed: !!result.zobristFailed,
        pv: result.pv,
      },
    };
    ctx.postMessage(out);
  } catch (err) {
    const out: WorkerResponse = {
      type: "error",
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(out);
  } finally {
    setActivePlaybookSnapshot(null);
  }
});
