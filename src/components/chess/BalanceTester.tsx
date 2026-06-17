import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { Difficulty } from "@/game/types";

interface Result {
  whiteWins: number;
  blackWins: number;
  draws: number;
  avgPlies: number;
}

export function BalanceTester() {
  const [white, setWhite] = useState<Difficulty>("medium");
  const [black, setBlack] = useState<Difficulty>("medium");
  const [games, setGames] = useState(50);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = () => {
    setResult(null);
    setProgress(0);
    setRunning(true);
    const w = new Worker(new URL("../../workers/sim.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<any>) => {
      if (e.data.kind === "progress") setProgress(e.data.done);
      else if (e.data.kind === "done") {
        setResult(e.data.result);
        setRunning(false);
        w.terminate();
        workerRef.current = null;
      }
    };
    w.postMessage({ white, black, games });
  };

  const stop = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
  };

  const total = result ? result.whiteWins + result.blackWins + result.draws : 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">Balance tester</h3>
        <span className="text-xs text-muted-foreground">AI vs AI</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">White</Label>
          <Select value={white} onValueChange={(v) => setWhite(v as Difficulty)} disabled={running}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Black</Label>
          <Select value={black} onValueChange={(v) => setBlack(v as Difficulty)} disabled={running}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Games</Label>
        <Input
          type="number"
          min={1}
          max={1000}
          value={games}
          disabled={running}
          onChange={(e) => setGames(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
          className="h-8"
        />
      </div>
      <div className="flex gap-2">
        {!running ? (
          <Button onClick={run} className="flex-1" size="sm">Run simulation</Button>
        ) : (
          <Button onClick={stop} variant="destructive" className="flex-1" size="sm">Stop</Button>
        )}
      </div>
      {running && (
        <div className="space-y-1">
          <Progress value={(progress / games) * 100} />
          <p className="text-xs text-muted-foreground text-center">{progress} / {games}</p>
        </div>
      )}
      {result && (
        <div className="space-y-2 pt-1">
          <div className="flex h-3 rounded-full overflow-hidden ring-1 ring-border">
            <div style={{ width: `${pct(result.whiteWins)}%`, background: "oklch(0.92 0.03 80)" }} />
            <div style={{ width: `${pct(result.draws)}%`, background: "oklch(0.7 0.02 85)" }} />
            <div style={{ width: `${pct(result.blackWins)}%`, background: "oklch(0.25 0.04 220)" }} />
          </div>
          <div className="grid grid-cols-3 text-center text-xs">
            <div>
              <div className="font-mono text-lg font-semibold">{pct(result.whiteWins)}%</div>
              <div className="text-muted-foreground">White ({result.whiteWins})</div>
            </div>
            <div>
              <div className="font-mono text-lg font-semibold">{pct(result.draws)}%</div>
              <div className="text-muted-foreground">Draws ({result.draws})</div>
            </div>
            <div>
              <div className="font-mono text-lg font-semibold">{pct(result.blackWins)}%</div>
              <div className="text-muted-foreground">Black ({result.blackWins})</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">avg {result.avgPlies.toFixed(1)} plies / game</p>
        </div>
      )}
    </div>
  );
}
