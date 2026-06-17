import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyMove, gameStatus, initialStateFromDesign, replayMoves } from "@/game/rules";
import { allLegalMoves, legalMovesFrom } from "@/game/moves";
import { chooseMove } from "@/game/ai";
import type { Color, Design, Difficulty, GameState, Move, PieceId, Square } from "@/game/types";
import { sfx } from "@/lib/sfx";

export interface UseGameOptions {
  humanColor: Color;
  difficulty: Difficulty;
  design: Design;
}

export function useGame(opts: UseGameOptions) {
  const [state, setState] = useState<GameState>(() => initialStateFromDesign(opts.design));
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<PieceId | null>(null);
  const aiThinkingRef = useRef(false);

  const status = gameStatus(state);
  const gameOver = status.kind === "checkmate" || status.kind === "stalemate" || status.kind === "royal-loss";

  const promotionOptions = useMemo<PieceId[]>(() => {
    const out: PieceId[] = [];
    for (const id of Object.keys(state.registry)) {
      if (state.registry[id].canBePromoted) out.push(id);
    }
    const order = ["Q", "R", "B", "N"];
    out.sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1; if (bi === -1) return -1;
      return ai - bi;
    });
    return out;
  }, [state.registry]);

  const reset = useCallback(() => {
    setState(initialStateFromDesign(opts.design));
    setPendingPromotion(null);
    setSelectedDrop(null);
  }, [opts.design]);

  const undo = useCallback(() => {
    setState((s) => {
      const targetUndo = s.history.length >= 2 ? 2 : s.history.length;
      const truncated = s.history.slice(0, s.history.length - targetUndo);
      return replayMoves(truncated, initialStateFromDesign(opts.design));
    });
    setPendingPromotion(null);
    setSelectedDrop(null);
  }, [opts.design]);

  const playMove = useCallback((move: Move) => {
    setState((s) => {
      const next = applyMove(s, move);
      if (move.captured) sfx.capture(); else sfx.move();
      const st = gameStatus(next);
      if (st.kind === "checkmate" || st.kind === "royal-loss") sfx.checkmate();
      else if (st.kind === "playing" && st.check) sfx.check();
      return next;
    });
  }, []);

  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: PieceId) => {
      if (state.turn !== opts.humanColor || gameOver) return false;
      const legal = legalMovesFrom(state, from);
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

  const tryDrop = useCallback(
    (pieceId: PieceId, to: Square) => {
      if (state.turn !== opts.humanColor || gameOver) return false;
      const legal = allLegalMoves(state).filter(
        (m) => m.kind === "drop" && m.dropPieceId === pieceId && m.to.r === to.r && m.to.c === to.c,
      );
      if (legal.length === 0) return false;
      playMove(legal[0]);
      setSelectedDrop(null);
      return true;
    },
    [state, opts.humanColor, gameOver, playMove],
  );

  const tryResurrect = useCallback(
    (from: Square, to: Square, resurrectPieceId: PieceId) => {
      if (state.turn !== opts.humanColor || gameOver) return false;
      const legal = legalMovesFrom(state, from);
      const chosen = legal.find(
        (m) =>
          m.kind === "resurrect" &&
          m.resurrectPieceId === resurrectPieceId &&
          m.to.r === to.r &&
          m.to.c === to.c,
      );
      if (!chosen) return false;
      playMove(chosen);
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
    return () => { clearTimeout(t); aiThinkingRef.current = false; };
  }, [state, opts.humanColor, opts.difficulty, gameOver, playMove]);

  const legalFor = useCallback(
    (from: Square | null): Square[] => {
      if (!from) return [];
      return legalMovesFrom(state, from).map((m) => m.to);
    },
    [state],
  );

  const legalDropSquares = useCallback(
    (pieceId: PieceId): Square[] => {
      if (state.turn !== opts.humanColor) return [];
      return allLegalMoves(state)
        .filter((m) => m.kind === "drop" && m.dropPieceId === pieceId)
        .map((m) => m.to);
    },
    [state, opts.humanColor],
  );

  return {
    state,
    status,
    gameOver,
    reset,
    undo,
    tryMove,
    tryDrop,
    legalFor,
    legalDropSquares,
    selectedDrop,
    setSelectedDrop,
    pendingPromotion,
    promotionOptions,
    cancelPromotion: () => setPendingPromotion(null),
    confirmPromotion: (piece: PieceId) => {
      if (!pendingPromotion) return;
      tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
  };
}
