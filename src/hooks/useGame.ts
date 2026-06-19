import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyMove, gameStatus, initialStateFromDesign, replayMoves } from "@/game/rules";
import { allLegalMoves, legalMovesFrom, moveTargetsFrom } from "@/game/moves";
import { chooseMove } from "@/game/ai";
import { requestMove as engineRequestMove, cancel as engineCancel, type AiSearchStats } from "@/game/ai/engine";
import { isAiDebugEnabled } from "@/lib/ai-debug";
import { loadPlaybook, mergeCloudPlaybook, difficultyCloudScale, type Playbook } from "@/game/ai/playbook";
import { getVariantPlaybook, submitGameReport, type ReportedMove } from "@/lib/ai-learning.functions";
import { loadCurrentMeta } from "@/game/design";
import { recordVariantPlay } from "@/lib/variant-stats.functions";
import type { Color, Design, Difficulty, GameState, Move, MoveTarget, PieceId, Square } from "@/game/types";
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
  const [aiThinking, setAiThinking] = useState(false);
  const [aiThinkingSince, setAiThinkingSince] = useState<number | null>(null);
  const [aiNudge, setAiNudge] = useState(0);

  const status = gameStatus(state);
  const gameOver = status.kind === "checkmate" || status.kind === "stalemate" || status.kind === "royal-loss";

  const promotionOptions = useMemo<PieceId[]>(() => {
    const starting = state.startingPieceIds && state.startingPieceIds.length > 0
      ? new Set(state.startingPieceIds)
      : null;
    const out: PieceId[] = [];
    for (const id of Object.keys(state.registry)) {
      const def = state.registry[id];
      if (!def) continue;
      if (def.special === "pawn" || def.special === "shapeshifter") continue;
      if (def.royal) continue;
      if (def.immobile) continue;
      if (def.special === "juggernaut") continue;
      if (def.special === "portal") continue;
      if (starting) {
        if (!starting.has(id)) continue;
      } else if (!def.canBePromoted) continue;
      out.push(id);
    }
    const order = ["Q", "R", "B", "N"];
    out.sort((a, b) => {
      const ai = order.indexOf(a); const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1; if (bi === -1) return -1;
      return ai - bi;
    });
    return out;
  }, [state.registry, state.startingPieceIds]);

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

  const takeback = useCallback(() => {
    setState((s) => {
      if (s.history.length === 0) return s;
      // Pop plies until it's the human's turn again so the human can re-decide.
      let truncatedLen = s.history.length;
      while (truncatedLen > 0) {
        truncatedLen -= 1;
        const replayed = replayMoves(s.history.slice(0, truncatedLen), initialStateFromDesign(opts.design));
        if (replayed.turn === opts.humanColor) return replayed;
      }
      return initialStateFromDesign(opts.design);
    });
    setPendingPromotion(null);
    setSelectedDrop(null);
  }, [opts.design, opts.humanColor]);

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
      // Allow normal moves AND the new necroRaise (click corpse square while
      // necromancer is selected). The legacy `resurrect` kind is still skipped.
      const candidates = legal.filter(
        (m) => m.to.r === to.r && m.to.c === to.c && m.kind !== "resurrect",
      );
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


  // Cloud-merged playbook (refetched once per variant/difficulty change).
  const [cloudPlaybook, setCloudPlaybook] = useState<Playbook | null>(null);
  useEffect(() => {
    let cancelled = false;
    const variantId = typeof window !== "undefined" ? loadCurrentMeta()?.id : undefined;
    const vKey = variantId ?? "__default__";
    const base = loadPlaybook(variantId ?? undefined);
    // Optimistic: use local immediately so the first AI move isn't delayed.
    setCloudPlaybook(base);
    getVariantPlaybook({ data: { variantId: vKey } })
      .then((cloud) => {
        if (cancelled) return;
        setCloudPlaybook(mergeCloudPlaybook(base, cloud, difficultyCloudScale(opts.difficulty)));
      })
      .catch(() => {
        // Network or signed-out — local playbook is fine.
      });
    return () => { cancelled = true; };
  }, [opts.difficulty, opts.design]);

  useEffect(() => {
    if (gameOver) return;
    if (state.turn === opts.humanColor) return;
    if (aiThinkingRef.current) return;
    aiThinkingRef.current = true;
    setAiThinking(true);
    setAiThinkingSince(Date.now());
    let cancelled = false;
    // Off-thread AI: worker keeps UI responsive (spinner animates, Nudge works).
    // Snapshot this variant's playbook so the worker's evaluate() actually sees it.
    const variantId = typeof window !== "undefined" ? loadCurrentMeta()?.id : undefined;
    const playbook = cloudPlaybook ?? loadPlaybook(variantId ?? undefined);
    engineRequestMove(state, opts.difficulty, { hardTimeoutMs: 30000, playbook })
      .then((move) => {
        if (cancelled) return;
        if (move) {
          playMove(move);
        } else {
          // Worker failed or timed out — synchronous fallback so the game
          // doesn't stall forever.
          const fb = chooseMove(state, "easy");
          if (fb) playMove(fb);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // Cancellation is expected when the user nudges; everything else logs.
        if (!(err instanceof Error && /cancel/i.test(err.message))) {
          console.error("AI move failed", err);
        }
      })
      .finally(() => {
        if (cancelled) return;
        aiThinkingRef.current = false;
        setAiThinking(false);
        setAiThinkingSince(null);
      });
    return () => {
      cancelled = true;
      aiThinkingRef.current = false;
      setAiThinking(false);
      setAiThinkingSince(null);
    };
  }, [state, opts.humanColor, opts.difficulty, gameOver, playMove, aiNudge, cloudPlaybook]);

  // Submit the finished game to the shared training pool (so the AI gets
  // better for everyone). Fire-and-forget; failures are silent.
  const reportedRef = useRef(false);
  useEffect(() => {
    if (!gameOver || reportedRef.current) return;
    reportedRef.current = true;
    const variantId = typeof window !== "undefined" ? loadCurrentMeta()?.id : "__default__";
    const aiColor: "w" | "b" = opts.humanColor === "w" ? "b" : "w";
    let result: "ai_win" | "ai_loss" | "draw" = "draw";
    if (status.kind === "checkmate" || status.kind === "royal-loss") {
      // The side whose turn it is has lost.
      result = state.turn === aiColor ? "ai_loss" : "ai_win";
    }
    const moves: ReportedMove[] = state.history.map((m) => ({
      m: m.from ? `${m.from.r * 100 + m.from.c}-${m.to.r * 100 + m.to.c}` : `drop@${m.to.r * 100 + m.to.c}`,
      p: m.piece.id,
      c: m.captured?.id,
      s: m.piece.color,
    }));
    submitGameReport({
      data: {
        variantId: variantId ?? "__default__",
        difficulty: opts.difficulty,
        result,
        aiColor,
        moves,
      },
    }).catch(() => { /* not signed in or offline — fine */ });
  }, [gameOver, status.kind, state.turn, state.history, opts.humanColor, opts.difficulty]);

  /** Re-kick the AI scheduler if it appears stuck. Terminates the worker. */
  const nudgeAi = useCallback(() => {
    engineCancel();
    aiThinkingRef.current = false;
    setAiThinking(false);
    setAiThinkingSince(null);
    setAiNudge((n) => n + 1);
  }, []);

  // Record one "play" per match start (counts toward the gallery counters).
  const recordedRef = useRef(false);
  useEffect(() => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const meta = typeof window !== "undefined" ? loadCurrentMeta() : null;
    if (!meta?.id) return;
    recordVariantPlay({ data: { variantKey: meta.id } }).catch(() => {
      // Best-effort; not signed in is fine, just skip.
    });
  }, []);

  const legalFor = useCallback(
    (from: Square | null): MoveTarget[] => {
      if (!from) return [];
      return moveTargetsFrom(state, from);
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
    takeback,
    tryMove,
    tryDrop,
    tryResurrect,
    legalFor,
    legalDropSquares,
    aiThinking,
    aiThinkingSince,
    nudgeAi,
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
