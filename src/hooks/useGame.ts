import { useCallback, useEffect, useRef, useState } from "react";
import { initialState } from "@/game/board";
import { applyMove, gameStatus, replayMoves } from "@/game/rules";
import { allLegalMoves, legalMovesFrom } from "@/game/moves";
import { chooseMove } from "@/game/ai";
import type { Color, Difficulty, GameState, Move, Square } from "@/game/types";
import { sfx } from "@/lib/sfx";

export interface UseGameOptions {
  humanColor: Color;
  difficulty: Difficulty;
}

export function useGame(opts: UseGameOptions) {
  const [state, setState] = useState<GameState>(() => initialState());
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const aiThinkingRef = useRef(false);

  const status = gameStatus(state);
  const gameOver = status.kind === "checkmate" || status.kind === "stalemate";

  const reset = useCallback(() => {
    setState(initialState());
    setPendingPromotion(null);
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      // Undo 2 plies (AI + human) when possible, otherwise 1.
      const targetUndo = s.history.length >= 2 ? 2 : s.history.length;
      const truncated = s.history.slice(0, s.history.length - targetUndo);
      return replayMoves(truncated, initialState());
    });
    setPendingPromotion(null);
  }, []);

  const playMove = useCallback(
    (move: Move) => {
      setState((s) => {
        const next = applyMove(s, move);
        if (move.captured) sfx.capture(); else sfx.move();
        const st = gameStatus(next);
        if (st.kind === "checkmate") sfx.checkmate();
        else if (st.kind === "playing" && st.check) sfx.check();
        return next;
      });
    },
    [],
  );

  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: "Q" | "R" | "N" | "B") => {
      if (state.turn !== opts.humanColor || gameOver) return false;
      const legal = legalMovesFrom(state.board, from, state.turn);
      // If promotion target, require explicit choice
      const candidates = legal.filter((m) => m.to.r === to.r && m.to.c === to.c);
      if (candidates.length === 0) return false;
      const promos = candidates.filter((m) => m.promotion);
      if (promos.length > 0 && !promotion) {
        setPendingPromotion({ from, to });
        return true;
      }
      const chosen = promotion
        ? candidates.find((m) => m.promotion === promotion)
        : candidates[0];
      if (!chosen) return false;
      playMove(chosen);
      setPendingPromotion(null);
      return true;
    },
    [state, opts.humanColor, gameOver, playMove],
  );

  // AI turn
  useEffect(() => {
    if (gameOver) return;
    if (state.turn === opts.humanColor) return;
    if (aiThinkingRef.current) return;
    aiThinkingRef.current = true;
    const t = setTimeout(() => {
      const move = chooseMove(state, opts.difficulty);
      if (move) playMove(move);
      aiThinkingRef.current = false;
    }, 250);
    return () => {
      clearTimeout(t);
      aiThinkingRef.current = false;
    };
  }, [state, opts.humanColor, opts.difficulty, gameOver, playMove]);

  const legalFor = useCallback(
    (from: Square | null): Square[] => {
      if (!from) return [];
      return legalMovesFrom(state.board, from, state.turn).map((m) => m.to);
    },
    [state],
  );

  const allLegal = useCallback(() => allLegalMoves(state.board, state.turn), [state]);

  return {
    state,
    status,
    gameOver,
    reset,
    undo,
    tryMove,
    legalFor,
    allLegal,
    pendingPromotion,
    cancelPromotion: () => setPendingPromotion(null),
    confirmPromotion: (piece: "Q" | "R" | "N" | "B") => {
      if (!pendingPromotion) return;
      tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
  };
}
