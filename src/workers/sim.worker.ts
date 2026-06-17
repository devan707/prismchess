/// <reference lib="webworker" />
import { simulateGames } from "../game/simulate";
import type { Difficulty } from "../game/types";

interface Req {
  white: Difficulty;
  black: Difficulty;
  games: number;
  maxPlies?: number;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { white, black, games, maxPlies } = e.data;
  const result = simulateGames(white, black, games, maxPlies ?? 200, (done) => {
    (self as unknown as Worker).postMessage({ kind: "progress", done });
  });
  (self as unknown as Worker).postMessage({ kind: "done", result });
};
