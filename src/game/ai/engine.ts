/**
 * Client-side engine wrapper: lazily boots the AI worker, sends a search
 * request, returns a Promise. `cancel()` terminates the in-flight worker so
 * the next request gets a fresh one — useful for the "Nudge" button.
 */
import type { Difficulty, GameState, Move } from "../types";
import type { WorkerRequest, WorkerResponse } from "./worker";
import { chooseMove } from "./index";
import { loadPlaybook, type Playbook } from "./playbook";

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
  hardTimeoutMs?: number;
  /** Per-variant playbook snapshot to use during this search. */
  playbook?: Playbook;
}

export function requestMove(
  state: GameState,
  difficulty: Difficulty,
  opts: RequestMoveOptions = {},
): Promise<Move | null> {
  const w = getWorker();
  const playbook = opts.playbook ?? loadPlaybook();
  if (!w) {
    return Promise.resolve(chooseMove(state, difficulty));
  }
  const id = nextId++;
  const safeState = JSON.parse(JSON.stringify(state)) as GameState;
  const msg: WorkerRequest = { type: "search", id, state: safeState, difficulty, playbook };
  return new Promise<Move | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const hard = opts.hardTimeoutMs ?? 30000;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      cancel();
      resolve(null);
    }, hard);
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

export function cancel(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, p] of pending) p.reject(new Error("AI search cancelled"));
  pending.clear();
}
