/// <reference lib="webworker" />
/**
 * AI worker entry. Receives a GameState + difficulty, runs an iterative-
 * deepening search, posts the chosen move back. Running in a Worker means
 * the UI thread stays responsive (spinner animates, "Nudge" stays clickable)
 * even when the engine is searching for several seconds on hard.
 */
import { runSearch, paramsFor } from "./search";
import type { Difficulty, GameState, Move } from "../types";

export type WorkerRequest = {
  type: "search";
  id: number;
  state: GameState;
  difficulty: Difficulty;
};

export type WorkerResponse =
  | { type: "result"; id: number; move: Move | null; depthReached: number; nodes: number; elapsedMs: number }
  | { type: "error"; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg?.type !== "search") return;
  try {
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
  }
});
