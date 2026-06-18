/// <reference lib="webworker" />
/**
 * AI worker entry. Receives a GameState + difficulty + playbook snapshot,
 * runs an iterative-deepening search, posts the chosen move back.
 *
 * Important: the playbook snapshot must come in from the main thread —
 * Workers have no window/localStorage, so reading the playbook directly
 * here would always yield defaults. See playbook.ts setActivePlaybookSnapshot.
 */
import { runSearch, paramsFor } from "./search";
import type { Difficulty, GameState, Move } from "../types";
import { setActivePlaybookSnapshot, type Playbook } from "./playbook";

export type WorkerRequest = {
  type: "search";
  id: number;
  state: GameState;
  difficulty: Difficulty;
  playbook?: Playbook | null;
};

export type WorkerResponse =
  | { type: "result"; id: number; move: Move | null; depthReached: number; nodes: number; elapsedMs: number }
  | { type: "error"; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg?.type !== "search") return;
  try {
    setActivePlaybookSnapshot(msg.playbook ?? null);
    const params = paramsFor(msg.state, msg.difficulty);
    const result = runSearch(msg.state, { difficulty: msg.difficulty, ...params });
    const out: WorkerResponse = {
      type: "result",
      id: msg.id,
      move: result.move,
      depthReached: result.depthReached,
      nodes: result.nodes,
      elapsedMs: result.elapsedMs,
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
