import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Board } from "@/components/chess/Board";
import { PromotionDialog } from "@/components/chess/PromotionDialog";
import { Captured, MoveHistory } from "@/components/chess/MoveHistory";
import { ReservesPanel } from "@/components/designer/ReservesPanel";
import { Home, Flag, RefreshCw, Clock, Copy, Handshake, UserPlus } from "lucide-react";
import { MatchChatPanel } from "@/components/MatchChatPanel";
import { sendFriendRequest } from "@/lib/social.functions";
import {
  getMatch, resign, claimTimeout,
} from "@/lib/multiplayer.functions";
import {
  formatClock, liveTimeRemaining, useMultiplayerGame, type MatchEvent, type MatchSnapshot,
} from "@/hooks/useMultiplayerGame";
import { toast } from "sonner";
import type { Color, Move } from "@/game/types";

export const Route = createFileRoute("/_authenticated/multiplayer/$matchId")({
  head: () => ({ meta: [{ title: "Multiplayer game — Prism Chess" }] }),
  component: MatchPage,
});

function MatchPage() {
  const { matchId } = Route.useParams();
  const fetchMatch = useServerFn(getMatch);
  const [bootstrap, setBootstrap] = useState<Awaited<ReturnType<typeof getMatch>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchMatch({ data: { matchId } })
      .then(setBootstrap)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load match"));
  }, [fetchMatch, matchId]);

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Link to="/multiplayer"><Button size="sm" variant="outline">Back to lobby</Button></Link>
      </div>
    );
  }
  if (!bootstrap) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading match…</div>;
  }

  return <Game matchId={matchId} bootstrap={bootstrap} />;
}

function Game({ matchId, bootstrap }: { matchId: string; bootstrap: Awaited<ReturnType<typeof getMatch>> }) {
  const initialMatch: MatchSnapshot = {
    id: bootstrap.match.id,
    host_id: bootstrap.match.host_id,
    guest_id: bootstrap.match.guest_id,
    host_color: bootstrap.match.host_color as Color,
    status: bootstrap.match.status as MatchSnapshot["status"],
    turn: bootstrap.match.turn as Color,
    white_time_ms: Number(bootstrap.match.white_time_ms),
    black_time_ms: Number(bootstrap.match.black_time_ms),
    last_clock_update_at: bootstrap.match.last_clock_update_at,
    result: bootstrap.match.result as MatchSnapshot["result"],
    result_reason: bootstrap.match.result_reason,
    time_control: bootstrap.match.time_control as MatchSnapshot["time_control"],
    design: bootstrap.match.design as unknown as MatchSnapshot["design"],
    design_name: bootstrap.match.design_name,
  };
  const initialMoves = (bootstrap.moves ?? []).map((m) => m.move as unknown as Move);
  const initialEvents = (bootstrap.events ?? []) as unknown as MatchEvent[];

  return (
    <ActiveGameView
      matchId={matchId}
      meId={bootstrap.meId}
      initialMatch={initialMatch}
      initialMoves={initialMoves}
      initialEvents={initialEvents}
      hostName={bootstrap.match.host?.display_name ?? bootstrap.match.host?.username ?? "Host"}
      guestName={bootstrap.match.guest?.display_name ?? bootstrap.match.guest?.username ?? null}
    />
  );
}

interface AGV {
  matchId: string;
  meId: string;
  initialMatch: MatchSnapshot;
  initialMoves: Move[];
  initialEvents: MatchEvent[];
  hostName: string;
  guestName: string | null;
}

function ActiveGameView({ matchId, meId, initialMatch, initialMoves, initialEvents, hostName, guestName }: AGV) {
  const navigate = useNavigate();
  const game = useMultiplayerGame({ matchId, meId, initialMatch, initialMoves, initialEvents });
  const resignFn = useServerFn(resign);
  const claimFn = useServerFn(claimTimeout);
  const addFriendFn = useServerFn(sendFriendRequest);

  const [flipped] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const {
    match, state, status, terminal, myColor, amPlayer,
    tryMove, tryDrop, legalFor, legalDropSquares, selectedDrop, setSelectedDrop,
    pendingPromotion, promotionOptions, confirmPromotion, cancelPromotion,
    incomingDrawOffer, myPendingDrawOffer, sendDrawOffer, respondToDraw,
  } = game;

  const whiteRemaining = liveTimeRemaining(match, "w", now);
  const blackRemaining = liveTimeRemaining(match, "b", now);

  const opponentColor: Color = myColor === "w" ? "b" : "w";
  const oppRemaining = liveTimeRemaining(match, opponentColor, now);
  // If opponent's clock has hit 0 mid-turn and game is still active, claim timeout once.
  const [timeoutClaimed, setTimeoutClaimed] = useState(false);
  useEffect(() => {
    if (timeoutClaimed) return;
    if (!amPlayer) return;
    if (match.status !== "active") return;
    if (match.turn !== opponentColor) return;
    if (oppRemaining > 0) return;
    if (match.time_control === "3day") return; // not auto-claimed on per-move 3day for simplicity
    setTimeoutClaimed(true);
    claimFn({ data: { matchId } }).catch(() => setTimeoutClaimed(false));
  }, [oppRemaining, match.status, match.turn, opponentColor, amPlayer, claimFn, matchId, timeoutClaimed, match.time_control]);

  const playerWhiteName = match.host_color === "w" ? hostName : (guestName ?? "Waiting…");
  const playerBlackName = match.host_color === "b" ? hostName : (guestName ?? "Waiting…");

  const topName = myColor === "w" ? playerBlackName : playerWhiteName;
  const bottomName = myColor === "w" ? playerWhiteName : playerBlackName;
  const topTime = myColor === "w" ? blackRemaining : whiteRemaining;
  const bottomTime = myColor === "w" ? whiteRemaining : blackRemaining;
  const topIsTurn = match.turn === (myColor === "w" ? "b" : "w") && match.status === "active";
  const bottomIsTurn = match.turn === myColor && match.status === "active";

  const opponentId = match.host_id === meId ? match.guest_id : match.host_id;
  const handleAddFriend = async () => {
    if (!opponentId) return;
    try { await addFriendFn({ data: { targetId: opponentId } }); toast.success("Friend request sent"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send request"); }
  };

  const check = status.kind === "playing" ? status.check : false;

  let banner: string;
  if (match.status === "open") {
    banner = "Waiting for opponent…";
  } else if (match.status === "finished") {
    const winnerLabel = match.result === "draw" ? "Draw" :
      match.result === myColor ? "You won" : "You lost";
    const reasonLabel = ({
      checkmate: "by checkmate", resign: "by resignation", timeout: "on time",
      draw_agreed: "by agreement", royal_loss: "royal captured", stalemate: "stalemate", aborted: "aborted",
    } as Record<string, string>)[match.result_reason ?? ""] ?? "";
    banner = `${winnerLabel} ${reasonLabel}`.trim();
  } else if (!amPlayer) {
    banner = "Spectating";
  } else if (check && match.turn === myColor) {
    banner = "You're in check";
  } else if (match.turn === myColor) {
    banner = "Your move";
  } else {
    banner = "Opponent's move";
  }

  const hasReserves = useMemo(
    () =>
      Object.values(state.reserves.w).some((n) => n > 0) ||
      Object.values(state.reserves.b).some((n) => n > 0),
    [state.reserves],
  );

  const handleResign = async () => {
    try { await resignFn({ data: { matchId } }); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const shareUrl = `${typeof window === "undefined" ? "" : window.location.origin}/multiplayer/join/${match.id}`;
  const copyShare = () => {
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy"),
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-3 py-2 flex items-center justify-between gap-2 border-b">
        <Link to="/multiplayer">
          <Button variant="ghost" size="icon" aria-label="Lobby"><Home className="h-4 w-4" /></Button>
        </Link>
        <div className="text-sm font-display truncate">{banner}</div>
        <div className="flex items-center gap-1">
          {opponentId && amPlayer && (
            <Button variant="ghost" size="icon" aria-label="Add friend" title="Add opponent as friend" onClick={handleAddFriend}>
              <UserPlus className="h-4 w-4" />
            </Button>
          )}
          {match.status === "open" && (
            <Button variant="ghost" size="sm" onClick={copyShare}>
              <Copy className="h-3 w-3 mr-1" /> Invite
            </Button>
          )}
          {match.status === "active" && amPlayer && (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Offer draw"
                title={myPendingDrawOffer ? "Draw offer sent — waiting" : "Offer a draw"}
                disabled={!!myPendingDrawOffer || !!incomingDrawOffer}
                onClick={sendDrawOffer}
              >
                <Handshake className={`h-4 w-4 ${myPendingDrawOffer ? "text-primary" : ""}`} />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Resign"><Flag className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Resign this game?</AlertDialogTitle>
                    <AlertDialogDescription>Your opponent will be awarded the win.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep playing</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResign}>Resign</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center gap-3 p-3">
        {incomingDrawOffer && amPlayer && (
          <div className="w-full max-w-[min(92vw,640px)] rounded-lg border bg-card px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Handshake className="h-4 w-4 text-primary" />
              <span>Opponent offers a draw</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => respondToDraw(false)}>Decline</Button>
              <Button size="sm" onClick={() => respondToDraw(true)}>Accept</Button>
            </div>
          </div>
        )}
        {myPendingDrawOffer && amPlayer && !incomingDrawOffer && (
          <div className="w-full max-w-[min(92vw,640px)] rounded-lg border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground text-center">
            Draw offer sent — waiting for opponent
          </div>
        )}
        <PlayerStrip name={topName} time={topTime} isTurn={topIsTurn} tc={match.time_control} />

        {hasReserves && (
          <ReservesPanel
            state={state}
            color={amPlayer ? myColor : "w"}
            selectedDrop={selectedDrop}
            onSelectDrop={setSelectedDrop}
            disabled={!amPlayer || terminal || match.turn !== myColor}
          />
        )}

        <Board
          state={state}
          humanColor={amPlayer ? myColor : "w"}
          flipped={flipped}
          legalFor={legalFor}
          onMove={(f, t) => tryMove(f, t)}
          dropPiece={selectedDrop}
          dropTargets={selectedDrop ? legalDropSquares(selectedDrop) : []}
          onDrop={(id, to) => tryDrop(id, to)}
          disabled={!amPlayer || terminal || match.turn !== myColor}
        />

        <PlayerStrip name={bottomName} time={bottomTime} isTurn={bottomIsTurn} tc={match.time_control} />

        <div className="w-full max-w-[min(92vw,640px)] space-y-3">
          <MoveHistory state={state} />
          <Captured state={state} />
        </div>

        {match.status === "finished" && (
          <div className="w-full max-w-[min(92vw,640px)] rounded-lg border bg-card p-4 text-center">
            <div className="font-display font-semibold mb-2">{banner}</div>
            <div className="flex gap-2 justify-center">
              <Link to="/multiplayer">
                <Button size="sm" variant="outline"><RefreshCw className="h-3 w-3 mr-1" /> Back to lobby</Button>
              </Link>
              <Button size="sm" onClick={() => navigate({ to: "/multiplayer" })}>New game</Button>
            </div>
          </div>
        )}
      </main>

      {pendingPromotion && (
        <PromotionDialog
          open
          options={promotionOptions}
          registry={state.registry}
          color={myColor}
          onChoose={(p) => { confirmPromotion(p); cancelPromotion(); }}
        />
      )}
    </div>
  );
}

function PlayerStrip({ name, time, isTurn, tc }: { name: string; time: number; isTurn: boolean; tc: string }) {
  const low = time < 30_000 && tc !== "3day";
  return (
    <div className={`w-full max-w-[min(92vw,640px)] rounded-lg border bg-card px-3 py-2 flex items-center justify-between ${isTurn ? "ring-2 ring-primary/60" : ""}`}>
      <div className="font-display font-semibold truncate">{name}</div>
      <div className={`flex items-center gap-1 font-mono text-sm tabular-nums ${low ? "text-destructive" : ""}`}>
        <Clock className="h-3 w-3" /> {formatClock(time)}
      </div>
    </div>
  );
}
