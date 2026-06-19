/**
 * Floating debug card for the AI engine. Visible only when AI debug mode is
 * on (URL `?debug=ai` or localStorage `prismchess.aiDebug`). Shows what the
 * most recent search actually did so we can measure the impact of changes
 * to the engine instead of guessing.
 */
import { useEffect, useState } from "react";
import type { AiSearchStats } from "@/game/ai/engine";
import { setAiDebugEnabled } from "@/lib/ai-debug";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Props {
  stats: AiSearchStats | null;
  thinking: boolean;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function fmtScore(cp: number): string {
  if (!Number.isFinite(cp)) return "—";
  if (Math.abs(cp) >= 99_000) {
    const sign = cp > 0 ? "+" : "-";
    return `${sign}M`; // mate
  }
  const pawns = cp / 100;
  const sign = pawns >= 0 ? "+" : "";
  return `${sign}${pawns.toFixed(2)}`;
}

function fmtMove(m: { from: { r: number; c: number } | null; to: { r: number; c: number }; piece: { id: string } }): string {
  const file = (c: number) => String.fromCharCode(97 + c);
  const to = `${file(m.to.c)}${m.to.r + 1}`;
  if (!m.from) return `${m.piece.id}@${to}`;
  const from = `${file(m.from.c)}${m.from.r + 1}`;
  return `${m.piece.id} ${from}→${to}`;
}

export function AiDebugPanel({ stats, thinking }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  // Tick once a second so the "thinking" pulse animates without React churn.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!thinking) return;
    const i = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(i);
  }, [thinking]);

  const nps = stats && stats.elapsedMs > 0 ? Math.round((stats.nodes / stats.elapsedMs) * 1000) : 0;
  const branching = stats && stats.depthReached > 0
    ? Math.pow(stats.nodes, 1 / stats.depthReached)
    : 0;
  const ttHitRate = stats && stats.tt.hits + stats.tt.stores > 0
    ? (stats.tt.hits / (stats.tt.hits + stats.tt.stores)) * 100
    : 0;

  return (
    <div className="fixed top-20 right-3 z-40 w-72 max-w-[85vw] rounded-lg border bg-card/95 backdrop-blur p-2 shadow-lg text-[11px] font-mono leading-tight">
      <div className="flex items-center justify-between mb-1 pb-1 border-b">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="font-sans font-semibold text-xs"
        >
          AI debug {thinking && <span className="text-amber-500">●</span>}
        </button>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0"
            title="Disable AI debug"
            onClick={() => { setAiDebugEnabled(false); window.location.reload(); }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <>
          {!stats ? (
            <div className="text-muted-foreground">No data yet. Take a move and wait for the AI.</div>
          ) : (
            <>
              {stats.zobristFailed && (
                <div className="mb-1 rounded bg-red-500/15 text-red-600 px-1 py-0.5">
                  Zobrist verify failed — TT disabled this search. See console.
                </div>
              )}
              <Row label="depth" value={`${stats.depthReached}`} />
              <Row label="score" value={`${fmtScore(stats.score)} pawns`} />
              <Row label="nodes" value={fmtCount(stats.nodes)} />
              <Row label="time" value={`${stats.elapsedMs} ms`} />
              <Row label="nps" value={fmtCount(nps)} />
              <Row label="eff. b" value={branching > 0 ? branching.toFixed(2) : "—"} />
              <div className="mt-1 pt-1 border-t">
                <Row label="tt size" value={fmtCount(stats.tt.size)} />
                <Row label="tt fill" value={`${stats.tt.fillPct.toFixed(1)}%`} />
                <Row label="tt hits" value={fmtCount(stats.tt.hits)} />
                <Row label="tt cuts" value={fmtCount(stats.tt.cutoffs)} />
                <Row label="tt store" value={fmtCount(stats.tt.stores)} />
                <Row label="hit rate" value={`${ttHitRate.toFixed(1)}%`} />
                {stats.tt.collisions > 0 && (
                  <Row label="tt coll" value={fmtCount(stats.tt.collisions)} highlight />
                )}
              </div>
              {stats.pv.length > 0 && (
                <div className="mt-1 pt-1 border-t">
                  <div className="text-muted-foreground mb-0.5">PV</div>
                  <div className="break-all">
                    {stats.pv.slice(0, 6).map((m, i) => (
                      <span key={i} className="inline-block mr-1">{fmtMove(m)}</span>
                    ))}
                  </div>
                </div>
              )}
              {stats.candidates && stats.candidates.length > 0 && (
                <div className="mt-1 pt-1 border-t">
                  <div className="text-muted-foreground mb-0.5">candidates (safety gate)</div>
                  <div className="space-y-0.5">
                    {stats.candidates.slice(0, 8).map((c, i) => (
                      <div
                        key={i}
                        className={
                          c.selected
                            ? "rounded bg-emerald-500/15 text-emerald-700 px-1"
                            : c.rejected
                              ? "rounded bg-red-500/10 text-red-600 px-1"
                              : "px-1"
                        }
                        title={c.rejectReason ?? (c.selected ? "selected" : "")}
                      >
                        <div className="flex justify-between">
                          <span>{fmtMove(c.move)}</span>
                          <span>{fmtScore(c.score)}</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>
                            +{Math.round(c.ourGain)} / −{Math.round(c.oppGain)}
                            {c.givesCheck ? " ✚" : ""}
                            {c.oppRoyalThreat ? " ☠" : ""}
                          </span>
                          <span>net {c.materialNet >= 0 ? "+" : ""}{Math.round(c.materialNet)}</span>
                        </div>
                        {c.rejectReason && (
                          <div className="text-[10px]">⛔ {c.rejectReason}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between ${highlight ? "text-amber-600" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
