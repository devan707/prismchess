import { initialState } from "./board";
import { applyMove, gameStatus } from "./rules";
import { chooseMove } from "./ai";
import type { Difficulty } from "./types";

export interface SimResult {
  whiteWins: number;
  blackWins: number;
  draws: number;
  avgPlies: number;
}

export function simulateGames(
  white: Difficulty,
  black: Difficulty,
  games: number,
  variantId: string,
  maxPlies = 200,
  onProgress?: (done: number) => void,
): SimResult {
  let w = 0, b = 0, d = 0, plies = 0;
  for (let i = 0; i < games; i++) {
    let s = initialState(variantId);
    let n = 0;
    while (n < maxPlies) {
      const status = gameStatus(s);
      if (status.kind === "checkmate") {
        if (status.winner === "w") w++; else b++;
        break;
      }
      if (status.kind === "stalemate") {
        d++;
        break;
      }
      const move = chooseMove(s, s.turn === "w" ? white : black);
      if (!move) {
        d++;
        break;
      }
      s = applyMove(s, move);
      n++;
    }
    if (n >= maxPlies) d++;
    plies += n;
    onProgress?.(i + 1);
  }
  return { whiteWins: w, blackWins: b, draws: d, avgPlies: plies / games };
}
