/**
 * Client-side engine wrapper: lazily boots the AI worker, sends a search
 * request, returns a Promise. `cancel()` terminates the in-flight worker so
 * the next request gets a fresh one — useful for the "Nudge" button.
 */
import type { Difficulty, GameState, Move } from "../types";
import type { WorkerRequest, WorkerResponse } from "./worker";
import { chooseMove } from "./index";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (m: Move | null) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.type === "result") p.resolve(msg.move);
      else p.reject(new Error(msg.message));
    });
    worker.addEventListener("error", (ev) => {
      // Reject all pending requests on a hard worker error.
      for (const [, p] of pending) p.reject(new Error(ev.message || "AI worker crashed"));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

export interface RequestMoveOptions {
  /** Wall-clock fallback. If the worker doesn't respond in this many ms,
   *  give up and resolve `null` so the caller can fall back to easy mode. */
  hardTimeoutMs?: number;
}

export function requestMove(
  state: GameState,
  difficulty: Difficulty,
  opts: RequestMoveOptions = {},
): Promise<Move | null> {
  const w = getWorker();
  if (!w) {
    // SSR / worker-disabled environment: fall back to synchronous chooseMove.
    return Promise.resolve(chooseMove(state, difficulty));
  }
  const id = nextId++;
  // Strip non-serializable bits (e.g. functions) — registry contains plain
  // data so structuredClone via postMessage works as-is, but we be defensive.
  const safeState = JSON.parse(JSON.stringify(state)) as GameState;
  const msg: WorkerRequest = { type: "search", id, state: safeState, difficulty };
  return new Promise<Move | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const hard = opts.hardTimeoutMs ?? 15000;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      // Hard kill — something is wedged.
      cancel();
      resolve(null);
    }, hard);
    // Wrap resolve/reject to clear the timer.
    const wrapped = pending.get(id)!;
    pending.set(id, {
      resolve: (m) => { clearTimeout(timer); wrapped.resolve(m); },
      reject: (e) => { clearTimeout(timer); wrapped.reject(e); },
    });
    try {
      w.postMessage(msg);
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** Terminate the worker and reject all pending requests. Used by "Nudge". */
export function cancel(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, p] of pending) p.reject(new Error("AI search cancelled"));
  pending.clear();
}
