import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { applyMove, gameStatus, initialStateFromDesign, replayMoves } from "@/game/rules";
import { allLegalMoves, legalMovesFrom } from "@/game/moves";
import type { Color, Design, GameState, Move, PieceId, Square } from "@/game/types";
import { sfx } from "@/lib/sfx";
import { submitMove, markFinished, offerDraw, respondDraw } from "@/lib/multiplayer.functions";
import { toast } from "sonner";

export interface MatchEvent {
  id: string;
  kind: string;
  actor_id: string | null;
  payload: unknown;
  created_at: string;
}

export interface MatchSnapshot {
  id: string;
  host_id: string;
  guest_id: string | null;
  host_color: Color;
  status: "open" | "active" | "finished" | "aborted";
  turn: Color;
  white_time_ms: number;
  black_time_ms: number;
  last_clock_update_at: string | null;
  result: "w" | "b" | "draw" | null;
  result_reason: string | null;
  time_control: "10min" | "30min" | "3day";
  design: Design;
  design_name: string;
}

export interface UseMultiplayerGameOpts {
  matchId: string;
  meId: string;
  initialMatch: MatchSnapshot;
  initialMoves: Move[];
  initialEvents?: MatchEvent[];
}

export function useMultiplayerGame(opts: UseMultiplayerGameOpts) {
  const { matchId, meId } = opts;
  const [match, setMatch] = useState<MatchSnapshot>(opts.initialMatch);
  const [moves, setMoves] = useState<Move[]>(opts.initialMoves);
  const [events, setEvents] = useState<MatchEvent[]>(opts.initialEvents ?? []);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<PieceId | null>(null);
  const submitFn = useServerFn(submitMove);
  const markFinishedFn = useServerFn(markFinished);
  const offerDrawFn = useServerFn(offerDraw);
  const respondDrawFn = useServerFn(respondDraw);
  const lastTerminalReportedRef = useRef<string | null>(null);

  const myColor: Color =
    meId === match.host_id ? match.host_color
    : meId === match.guest_id ? (match.host_color === "w" ? "b" : "w")
    : match.host_color; // spectator fallback (shouldn't happen)
  const amPlayer = meId === match.host_id || meId === match.guest_id;

  const state = useMemo<GameState>(() => {
    return replayMoves(moves, initialStateFromDesign(match.design));
  }, [moves, match.design]);

  const status = useMemo(() => gameStatus(state), [state]);
  const terminal =
    match.status === "finished" ||
    status.kind === "checkmate" ||
    status.kind === "stalemate" ||
    status.kind === "royal-loss";

  // Report terminal board state to server (first player to notice wins the race; idempotent on server).
  useEffect(() => {
    if (match.status !== "active") return;
    if (!amPlayer) return;
    let reason: "checkmate" | "stalemate" | "royal_loss" | null = null;
    let winner: Color | null = null;
    if (status.kind === "checkmate") { reason = "checkmate"; winner = status.winner; }
    else if (status.kind === "royal-loss") { reason = "royal_loss"; winner = status.winner; }
    else if (status.kind === "stalemate") { reason = "stalemate"; winner = null; }
    if (!reason) return;
    const key = `${reason}:${winner ?? "draw"}`;
    if (lastTerminalReportedRef.current === key) return;
    lastTerminalReportedRef.current = key;
    markFinishedFn({ data: { matchId, reason, winner } }).catch(() => {});
  }, [status, match.status, amPlayer, markFinishedFn, matchId]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`match:${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => {
          const next = payload.new as Record<string, unknown>;
          setMatch((prev) => ({ ...prev, ...next, design: prev.design } as MatchSnapshot));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_moves", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as { ply: number; move: Move };
          setMoves((prev) => {
            if (prev.length > row.ply) return prev; // already applied (optimistic)
            const next = [...prev];
            next[row.ply] = row.move;
            // Fill any gaps as safety (shouldn't happen)
            for (let i = 0; i < next.length; i++) if (next[i] === undefined) return prev;
            return next;
          });
          if (row.move?.captured) sfx.capture(); else sfx.move();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_events", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const row = payload.new as MatchEvent;
          setEvents((prev) => (prev.some((e) => e.id === row.id) ? prev : [...prev, row]));
          if (row.actor_id && row.actor_id !== meId) {
            if (row.kind === "draw_offer") toast.message("Opponent offered a draw");
            else if (row.kind === "draw_accept") toast.success("Draw accepted");
            else if (row.kind === "draw_decline") toast.message("Draw declined");
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchId, meId]);

  // A draw offer from either side is "pending" until a response or a subsequent move
  // (a new move auto-declines per chess convention).
  const pendingDrawOffer = useMemo<MatchEvent | null>(() => {
    if (match.status !== "active") return null;
    let lastOffer: MatchEvent | null = null;
    for (const e of events) {
      if (e.kind === "draw_offer") lastOffer = e;
      else if (e.kind === "draw_accept" || e.kind === "draw_decline") lastOffer = null;
    }
    if (!lastOffer) return null;
    const offerPly = (lastOffer.payload as { ply?: number } | null)?.ply ?? 0;
    if (moves.length > offerPly) return null;
    return lastOffer;
  }, [events, match.status, moves.length]);

  const incomingDrawOffer = pendingDrawOffer && pendingDrawOffer.actor_id !== meId ? pendingDrawOffer : null;
  const myPendingDrawOffer = pendingDrawOffer && pendingDrawOffer.actor_id === meId ? pendingDrawOffer : null;

  const sendDrawOffer = useCallback(async () => {
    try {
      await offerDrawFn({ data: { matchId } });
      toast.success("Draw offer sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send offer");
    }
  }, [offerDrawFn, matchId]);

  const respondToDraw = useCallback(async (accept: boolean) => {
    try {
      await respondDrawFn({ data: { matchId, accept } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to respond");
    }
  }, [respondDrawFn, matchId]);

  const playMoveOptimistic = useCallback(
    (m: Move) => {
      const expectedPly = moves.length;
      setMoves((prev) => [...prev, m]);
      if (m.captured) sfx.capture(); else sfx.move();
      submitFn({ data: { matchId, ply: expectedPly, move: m as unknown as Record<string, unknown> } })
        .catch((err: Error) => {
          // Rollback
          setMoves((prev) => prev.slice(0, expectedPly));
          toast.error(err.message || "Move rejected");
        });
    },
    [moves.length, submitFn, matchId],
  );

  const tryMove = useCallback(
    (from: Square, to: Square, promotion?: PieceId) => {
      if (!amPlayer || terminal) return false;
      if (match.turn !== myColor) return false;
      const legal = legalMovesFrom(state, from);
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
      playMoveOptimistic(chosen);
      setPendingPromotion(null);
      return true;
    },
    [amPlayer, terminal, match.turn, myColor, state, playMoveOptimistic],
  );

  const tryDrop = useCallback(
    (pieceId: PieceId, to: Square) => {
      if (!amPlayer || terminal) return false;
      if (match.turn !== myColor) return false;
      const legal = allLegalMoves(state).filter(
        (m) => m.kind === "drop" && m.dropPieceId === pieceId && m.to.r === to.r && m.to.c === to.c,
      );
      if (legal.length === 0) return false;
      playMoveOptimistic(legal[0]);
      setSelectedDrop(null);
      return true;
    },
    [amPlayer, terminal, match.turn, myColor, state, playMoveOptimistic],
  );

  const legalFor = useCallback(
    (from: Square | null): Square[] => {
      if (!from) return [];
      return legalMovesFrom(state, from).map((m) => m.to);
    },
    [state],
  );

  const legalDropSquares = useCallback(
    (pieceId: PieceId): Square[] => {
      if (match.turn !== myColor) return [];
      return allLegalMoves(state)
        .filter((m) => m.kind === "drop" && m.dropPieceId === pieceId)
        .map((m) => m.to);
    },
    [state, match.turn, myColor],
  );

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

  return {
    match,
    moves,
    state,
    status,
    terminal,
    myColor,
    amPlayer,
    tryMove,
    tryDrop,
    legalFor,
    legalDropSquares,
    selectedDrop,
    setSelectedDrop,
    events,
    incomingDrawOffer,
    myPendingDrawOffer,
    sendDrawOffer,
    respondToDraw,
    pendingPromotion,
    promotionOptions,
    cancelPromotion: () => setPendingPromotion(null),
    confirmPromotion: (piece: PieceId) => {
      if (!pendingPromotion) return;
      tryMove(pendingPromotion.from, pendingPromotion.to, piece);
    },
  };
}

/** Formats clock ms as MM:SS or D:HH:MM for long games. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 24 * 3600) {
    const d = Math.floor(s / (24 * 3600));
    const h = Math.floor((s % (24 * 3600)) / 3600);
    return `${d}d ${h}h`;
  }
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Live remaining time for a side, given the server snapshot. */
export function liveTimeRemaining(match: MatchSnapshot, color: Color, now = Date.now()): number {
  const stored = color === "w" ? match.white_time_ms : match.black_time_ms;
  if (match.status !== "active") return stored;
  if (match.turn !== color) return stored;
  if (!match.last_clock_update_at) return stored;
  const elapsed = now - new Date(match.last_clock_update_at).getTime();
  return Math.max(0, stored - elapsed);
}

// avoid unused warning when caller doesn't use applyMove import — keep for tree-shake clarity
export const _applyMove = applyMove;
