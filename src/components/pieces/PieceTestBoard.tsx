import { useMemo, useState } from "react";
import { compileOption, type MoveOption } from "@/game/customMovement";
import type { MovementSpec, PieceDef } from "@/game/types";
import { PieceById } from "@/components/chess/PieceGlyph";
import { Button } from "@/components/ui/button";
import { RotateCcw, Swords, Shield, Eraser } from "lucide-react";

type Occupant = "self" | "ally" | "enemy";
type Tool = "enemy" | "ally" | "erase";

interface Props {
  def: PieceDef;
  options: MoveOption[];
  rangedSpec?: MovementSpec;
  size?: number;
}

interface Target {
  r: number;
  c: number;
  kind: "move" | "capture" | "ranged";
  conditional: boolean;
}

/** Interactive playtest board — click the piece to highlight legal squares,
 *  click a target to move (or ranged-capture). Use the toolbar to drop
 *  allies/enemies on the board and try out captures, blocks and slides. */
export function PieceTestBoard({ def, options, rangedSpec, size = 9 }: Props) {
  const initial = useMemo(() => {
    const m = new Map<string, Occupant>();
    const center = Math.floor(size / 2);
    m.set(`${center},${center}`, "self");
    return m;
  }, [size]);

  const [board, setBoard] = useState<Map<string, Occupant>>(initial);
  const [selfPos, setSelfPos] = useState<{ r: number; c: number }>({
    r: Math.floor(size / 2),
    c: Math.floor(size / 2),
  });
  const [selected, setSelected] = useState(false);
  const [tool, setTool] = useState<Tool>("enemy");
  const [hasMoved, setHasMoved] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const inBounds = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size;

  /** Compute legal destinations from current self position given current board. */
  const targets = useMemo<Target[]>(() => {
    if (!selected) return [];
    const out: Target[] = [];
    const seen = new Map<string, Target>();
    const add = (t: Target) => {
      const key = `${t.r},${t.c}`;
      const prev = seen.get(key);
      // capture beats move (more useful), conditional only if no unconditional version exists
      if (!prev) {
        seen.set(key, t);
        out.push(t);
      } else if (prev.conditional && !t.conditional) {
        Object.assign(prev, t);
      }
    };

    for (const opt of options) {
      const c = compileOption(opt);
      if (c.error) continue;
      const cond = opt.condition !== "none";
      if (cond && hasMoved) continue; // "from-starting-square" only on first move
      const kind = opt.kind;

      for (const o of c.spec.leaps ?? []) {
        const r = selfPos.r + o.dr, cc = selfPos.c + o.dc;
        if (!inBounds(r, cc)) continue;
        const occ = board.get(`${r},${cc}`);
        if (occ === "self" || occ === "ally") continue;
        if (occ === "enemy") {
          if (kind === "move-only") continue;
          add({ r, c: cc, kind: "capture", conditional: cond });
        } else {
          if (kind === "capture-only") continue;
          add({ r, c: cc, kind: "move", conditional: cond });
        }
      }

      for (const d of c.spec.slides ?? []) {
        const max = d.max && d.max > 0 ? d.max : size;
        let r = selfPos.r + d.dr, cc = selfPos.c + d.dc, n = 0;
        while (inBounds(r, cc) && n < max) {
          const occ = board.get(`${r},${cc}`);
          if (occ === "self" || occ === "ally") break;
          if (occ === "enemy") {
            if (kind !== "move-only") add({ r, c: cc, kind: "capture", conditional: cond });
            break;
          }
          if (kind !== "capture-only") add({ r, c: cc, kind: "move", conditional: cond });
          r += d.dr; cc += d.dc; n++;
        }
      }
    }

    // ranged attacks — capture-only, don't move the piece.
    // Show the reach even when empty so the user knows where to place an enemy.
    for (const o of rangedSpec?.leaps ?? []) {
      const r = selfPos.r + o.dr, cc = selfPos.c + o.dc;
      if (!inBounds(r, cc)) continue;
      const occ = board.get(`${r},${cc}`);
      if (occ === "self" || occ === "ally") continue;
      add({ r, c: cc, kind: "ranged", conditional: occ !== "enemy" });
    }

    return out;
  }, [selected, options, rangedSpec, selfPos, board, hasMoved, size]);

  const pushLog = (msg: string) => setLog((l) => [msg, ...l].slice(0, 5));

  const handleCellClick = (r: number, c: number) => {
    const key = `${r},${c}`;
    const occ = board.get(key);
    // If a target is highlighted there, perform the action.
    const tgt = targets.find((t) => t.r === r && t.c === c);
    // A ranged target without an enemy on it is just a reach indicator —
    // fall through to the tool so the user can drop an enemy there.
    const fireable = tgt && !(tgt.kind === "ranged" && occ !== "enemy");
    if (selected && fireable) {
      const next = new Map(board);
      if (tgt!.kind === "ranged") {
        next.delete(key);
        pushLog(`Ranged-captured enemy at ${coord(r, c, size)}.`);
      } else {
        // move (and capture if enemy was there)
        next.delete(`${selfPos.r},${selfPos.c}`);
        if (tgt!.kind === "capture") pushLog(`Captured enemy at ${coord(r, c, size)}.`);
        else pushLog(`Moved to ${coord(r, c, size)}.`);
        next.set(key, "self");
        setSelfPos({ r, c });
        setHasMoved(true);
      }
      setBoard(next);
      setSelected(false);
      return;
    }

    // Click on self: toggle selection
    if (occ === "self") {
      setSelected((s) => !s);
      return;
    }

    // Otherwise, use the active tool to edit the board.
    setSelected(false);
    const next = new Map(board);
    if (tool === "erase") next.delete(key);
    else if (occ === tool) next.delete(key); // toggle off
    else next.set(key, tool);
    setBoard(next);
  };

  const reset = () => {
    setBoard(initial);
    setSelfPos({ r: Math.floor(size / 2), c: Math.floor(size / 2) });
    setSelected(false);
    setHasMoved(false);
    setLog([]);
  };

  const clearOthers = () => {
    const next = new Map<string, Occupant>();
    next.set(`${selfPos.r},${selfPos.c}`, "self");
    setBoard(next);
    setSelected(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant={tool === "enemy" ? "default" : "outline"} onClick={() => setTool("enemy")} className="h-7 px-2 text-xs">
          <Swords className="h-3 w-3 mr-1" /> Enemy
        </Button>
        <Button type="button" size="sm" variant={tool === "ally" ? "default" : "outline"} onClick={() => setTool("ally")} className="h-7 px-2 text-xs">
          <Shield className="h-3 w-3 mr-1" /> Ally
        </Button>
        <Button type="button" size="sm" variant={tool === "erase" ? "default" : "outline"} onClick={() => setTool("erase")} className="h-7 px-2 text-xs">
          <Eraser className="h-3 w-3 mr-1" /> Erase
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={clearOthers} className="h-7 px-2 text-xs">
          Clear pieces
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={reset} className="h-7 px-2 text-xs">
          <RotateCcw className="h-3 w-3 mr-1" /> Reset
        </Button>
      </div>

      <div
        className="grid border border-border rounded-sm overflow-hidden w-full max-w-[320px] aspect-square select-none"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {Array.from({ length: size * size }).map((_, i) => {
          const r = Math.floor(i / size), c = i % size;
          const isDark = (r + c) % 2 === 1;
          const occ = board.get(`${r},${c}`);
          const tgt = targets.find((t) => t.r === r && t.c === c);
          const isSelfSel = occ === "self" && selected;
          return (
            <button
              type="button"
              key={i}
              onClick={() => handleCellClick(r, c)}
              className="relative flex items-center justify-center aspect-square cursor-pointer hover:brightness-110 transition"
              style={{ background: isDark ? "rgb(120 113 108 / 0.35)" : "rgb(245 245 244 / 0.6)" }}
            >
              {/* target highlight */}
              {tgt && (
                <>
                  <span
                    className={`absolute inset-0 ${
                      tgt.kind === "capture"
                        ? "bg-red-500/30 ring-2 ring-red-500"
                        : tgt.kind === "ranged"
                        ? "bg-orange-500/20 ring-2 ring-dashed ring-orange-500"
                        : "bg-emerald-500/20 ring-2 ring-emerald-500"
                    } ${tgt.conditional && tgt.kind !== "ranged" ? "ring-dashed" : ""}`}
                  />
                  {tgt.kind === "ranged" && (
                    // Crosshair so ranged squares read as "fire here", not "move here".
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="relative block w-4 h-4 rounded-full border-2 border-orange-600">
                        <span className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[2px] bg-orange-600" />
                        <span className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-[2px] bg-orange-600" />
                      </span>
                    </span>
                  )}
                </>
              )}
              {isSelfSel && <span className="absolute inset-0 ring-2 ring-amber-400" />}
              {occ === "self" && (
                <span className="relative z-10 text-2xl leading-none">
                  <PieceById id={def.id} color="w" def={def} className="text-2xl" />
                </span>
              )}
              {occ === "enemy" && (
                <span className="relative z-10 w-4 h-4 rounded-full bg-rose-600 border-2 border-rose-900" />
              )}
              {occ === "ally" && (
                <span className="relative z-10 w-4 h-4 rounded-full bg-sky-500 border-2 border-sky-900" />
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Click your piece to {selected ? "deselect" : "highlight legal moves"}.
        Tool <strong>{tool}</strong> drops/erases pieces on empty squares.
        {hasMoved && " (Starting-square-only moves are disabled until you reset.)"}
      </p>

      {log.length > 0 && (
        <ul className="text-[11px] text-muted-foreground space-y-0.5">
          {log.map((l, i) => (<li key={i}>• {l}</li>))}
        </ul>
      )}
    </div>
  );
}

function coord(r: number, c: number, size: number) {
  // Show relative-to-center coordinates so it reads like a chess offset.
  const center = Math.floor(size / 2);
  const dr = center - r; // forward = positive
  const dc = c - center;
  const ns = dr === 0 ? "" : dr > 0 ? `${dr}↑` : `${-dr}↓`;
  const ew = dc === 0 ? "" : dc > 0 ? `${dc}→` : `${-dc}←`;
  return [ns, ew].filter(Boolean).join(" ") || "center";
}
