import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialState } from "@/game/board";
import { applyMove, gameStatus, replayMoves } from "@/game/rules";
import { allLegalMoves, ctxFromState, legalMovesFrom } from "@/game/moves";
import { chooseMove } from "@/game/ai";
import { VARIANTS, type Color, type Difficulty, type GameState, type Move, type PromotionPiece, type Square } from "@/game/types";
import { sfx } from "@/lib/sfx";

export interface UseGameOptions {
  humanColor: Color;
  difficulty: Difficulty;
  variantId: string;
}

export function useGame(opts: UseGameOptions) {
  const [state, setState] = useState<GameState>(() => initialState(opts.variantId));
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const aiThinkingRef = useRef(false);

  const status = gameStatus(state);
  const gameOver = status.kind === "checkmate" || status.kind === "stalemate";

  const promotionOptions = useMemo<PromotionPiece[]>(() => {
    const variant = VARIANTS[opts.variantId];
    const base: PromotionPiece[] = ["R", "N", "B"];
    if (variant?.backRank.includes("Q")) base.unshift("Q");
    return base;
  }, [opts.variantId]);

  const reset = useCallback(() => {
    setState(initialState(opts.variantId));
    setPendingPromotion(null);
  }, [opts.variantId]);

  const undo = useCallback(() => {
    setState((s) => {
      const targetUndo = s.history.length >= 2 ? 2 : s.history.length;
      const truncated = s.history.slice(0, s.history.length - targetUndo);
      return replayMoves(truncated, initialState(opts.variantId));
    });
    setPendingPromotion(null);
  }, [opts.variantId]);

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
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      if (state.turn !== opts.humanColor || gameOver) return false;
      const legal = legalMovesFrom(state.board, from, state.turn);
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
    promotionOptions,
    cancelPromotion: () => setPendingPromotion(null),
    confirmPromotion: (piece: PromotionPiece) => {
      if (!pendingPromotion) return;
      tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
  };
}
