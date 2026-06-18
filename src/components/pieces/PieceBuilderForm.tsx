import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ABSOLUTE_DIR_OPTIONS,
  RELATIVE_DIR_OPTIONS,
  compileMovement,
  defaultStep,
  type MoveStep,
  type StepDirAbs,
  type StepDirRel,
} from "@/game/customMovement";
import { PieceReachPreview } from "./PieceReachPreview";
import { PieceById } from "@/components/chess/PieceGlyph";
import { PieceWorthBadge } from "@/components/pieces/PieceWorthBadge";
import type { PieceDef } from "@/game/types";
import { estimatePiecePoints } from "@/game/pieceValue";
import { savePiece, suggestPieceEmoji } from "@/lib/piece-builder.functions";
import { Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onSaved?: (pieceId: string, def: PieceDef) => void;
}

const MAX_STEPS = 4;

/**
 * Construct the PieceDef stored in the database AND used in-game.
 * Custom piece ids are namespaced `u:<random>` so they don't collide with
 * the built-in single-letter ids.
 */
function buildPieceDef(opts: {
  id: string;
  name: string;
  description: string;
  emoji: string;
  steps: MoveStep[];
  pointsOverride?: number;
}): PieceDef | { error: string } {
  const compiled = compileMovement(opts.steps);
  if (compiled.error) return { error: compiled.error };
  const def: PieceDef = {
    id: opts.id,
    name: opts.name,
    glyph: opts.emoji,
    emoji: true,
    movement: compiled.spec,
    description: opts.description,
    builtinCustom: false,
  };
  if (opts.pointsOverride != null) def.pointsOverride = opts.pointsOverride;
  return def;
}

function genId(): string {
  return "u:" + Math.random().toString(36).slice(2, 8);
}

export function PieceBuilderForm({ onSaved }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconPrompt, setIconPrompt] = useState("");
  const [emoji, setEmoji] = useState("");
  const [emojiBusy, setEmojiBusy] = useState(false);
  const [steps, setSteps] = useState<MoveStep[]>([defaultStep()]);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overridePts, setOverridePts] = useState<number>(3);
  const [saving, setSaving] = useState(false);
  const suggest = useServerFn(suggestPieceEmoji);
  const save = useServerFn(savePiece);

  const id = useMemo(() => genId(), []);

  const validation = useMemo(() => {
    if (!name.trim()) return "Name your piece.";
    if (!emoji) return "Pick or generate an icon (emoji).";
    const c = compileMovement(steps);
    if (c.error) return c.error;
    return null;
  }, [name, emoji, steps]);

  const previewDef: PieceDef = {
    id,
    name: name || "New piece",
    glyph: emoji || "❓",
    emoji: true,
    movement: compileMovement(steps).spec,
    description,
  };

  const estimatedPts = useMemo(() => estimatePiecePoints(previewDef), [previewDef]);
  const finalPts = overrideEnabled ? overridePts : estimatedPts;

  const updateStep = (idx: number, patch: Partial<MoveStep>) =>
    setSteps((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const addStep = () => {
    setSteps((arr) => [
      ...arr,
      {
        direction: { kind: "relative", rel: "any-perp" },
        distance: 1,
        jumps: true,
      },
    ]);
  };

  const removeStep = (idx: number) => setSteps((arr) => arr.filter((_, i) => i !== idx));

  const handleEmoji = async () => {
    if (!name.trim() && !iconPrompt.trim()) {
      toast.info("Name the piece or describe the icon first.");
      return;
    }
    setEmojiBusy(true);
    try {
      const res = await suggest({
        data: { name: name.trim() || iconPrompt.trim(), description: iconPrompt.trim() || description.trim() },
      });
      if (res.ok) {
        setEmoji(res.emoji);
        toast.success(`AI picked ${res.emoji}`);
      } else {
        toast.error(res.error);
      }
    } finally {
      setEmojiBusy(false);
    }
  };

  const doSave = async (visibility: "private" | "public") => {
    if (validation) { toast.error(validation); return; }
    const def = buildPieceDef({
      id, name: name.trim(), description: description.trim(), emoji, steps,
      pointsOverride: overrideEnabled ? overridePts : undefined,
    });
    if ("error" in def) { toast.error(def.error); return; }
    setSaving(true);
    try {
      const row = await save({
        data: {
          name: name.trim(),
          description: description.trim(),
          def: def as unknown as Record<string, unknown>,
          visibility,
        },
      });
      toast.success(
        visibility === "public"
          ? `Published "${name.trim()}" to the community library`
          : `Saved "${name.trim()}" to your library`,
      );
      onSaved?.(row.id, def);
      // Reset
      setName(""); setDescription(""); setIconPrompt(""); setEmoji("");
      setSteps([defaultStep()]);
      setOverrideEnabled(false);
      setOverridePts(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the piece.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-6">
        {/* Identity */}
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="font-display text-lg font-semibold">1. Name & description</h2>
          <div className="grid sm:grid-cols-[1fr_2fr] gap-3">
            <div>
              <Label htmlFor="piece-name">Name</Label>
              <Input id="piece-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Coiled Serpent" maxLength={60} />
            </div>
            <div>
              <Label htmlFor="piece-desc">Short description</Label>
              <Input id="piece-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What makes it special?" maxLength={400} />
            </div>
          </div>
        </section>

        {/* Icon */}
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="font-display text-lg font-semibold">2. Icon</h2>
          <p className="text-xs text-muted-foreground">
            Describe what the piece looks like — the AI picks one emoji. It will be rendered in the same black-and-white style as built-in pieces.
          </p>
          <div className="flex gap-2">
            <Input
              value={iconPrompt}
              onChange={(e) => setIconPrompt(e.target.value)}
              placeholder="a coiled snake with bright fangs"
              maxLength={200}
              className="flex-1"
            />
            <Button onClick={handleEmoji} disabled={emojiBusy} variant="outline">
              <Wand2 className="h-4 w-4 mr-1" /> {emojiBusy ? "Picking…" : emoji ? "Regenerate" : "Generate"}
            </Button>
          </div>
        </section>

        {/* Movement */}
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="font-display text-lg font-semibold">3. Movement</h2>
          <p className="text-xs text-muted-foreground">
            Define one step at a time. For knight-like pieces, every step must "jump over pieces" — pieces in the path won't block.
            For rook/bishop-like pieces, use a single step with unlimited distance.
          </p>
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <StepRow
                key={idx}
                idx={idx}
                step={step}
                canRemove={steps.length > 1}
                onChange={(patch) => updateStep(idx, patch)}
                onRemove={() => removeStep(idx)}
              />
            ))}
          </div>
          {steps.length < MAX_STEPS && (
            <Button variant="outline" size="sm" onClick={addStep}>
              <Plus className="h-4 w-4 mr-1" /> Add step
            </Button>
          )}
        </section>

        {/* Capture (v1: same as movement) */}
        <section className="rounded-lg border bg-card p-4 space-y-2">
          <h2 className="font-display text-lg font-semibold">4. Capture</h2>
          <p className="text-xs text-muted-foreground">
            Captures on the square it lands on (standard chess). Ranged attacks, stampede, and special abilities are coming in the next release.
          </p>
        </section>
      </div>

      {/* Right rail: live preview + save */}
      <aside className="space-y-4">
        <div className="rounded-lg border bg-card p-4 space-y-3 sticky top-4">
          <h3 className="font-display text-sm font-semibold">Preview</h3>
          <div className="flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-lg bg-stone-200 dark:bg-stone-800 flex items-center justify-center">
              <PieceById id={previewDef.id} color="w" def={previewDef} className="text-5xl" />
            </div>
            <div className="w-20 h-20 rounded-lg bg-stone-700 flex items-center justify-center">
              <PieceById id={previewDef.id} color="b" def={previewDef} className="text-5xl" />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Reach from a center cell</p>
            <PieceReachPreview steps={steps} />
          </div>

          {/* Worth */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Worth</span>
              <PieceWorthBadge
                id={previewDef.id}
                def={{ ...previewDef, pointsOverride: finalPts }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Estimated: <span className="font-mono tabular-nums">{estimatedPts}</span> pts
              {" "}(calibrated to classical chess: P=1, N/B=3, R=5, Q=9).
            </p>
            <label className="flex items-center gap-2 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={overrideEnabled}
                onChange={(e) => {
                  setOverrideEnabled(e.target.checked);
                  if (e.target.checked) setOverridePts(estimatedPts);
                }}
              />
              Override manually
            </label>
            {overrideEnabled && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.5}
                  max={14}
                  step={0.5}
                  value={overridePts}
                  onChange={(e) => setOverridePts(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-mono text-xs tabular-nums w-8 text-right">{overridePts}</span>
              </div>
            )}
          </div>
          <div className="border-t pt-3 space-y-2">
            {validation && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> {validation}
              </p>
            )}
            <Button className="w-full" variant="outline" disabled={!!validation || saving} onClick={() => doSave("private")}>
              Save private
            </Button>
            <Button className="w-full" disabled={!!validation || saving} onClick={() => doSave("public")}>
              Publish public
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

interface StepProps {
  idx: number;
  step: MoveStep;
  canRemove: boolean;
  onChange: (patch: Partial<MoveStep>) => void;
  onRemove: () => void;
}

function StepRow({ idx, step, canRemove, onChange, onRemove }: StepProps) {
  const isFirst = idx === 0;
  const dirKind = step.direction.kind;

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Step {idx + 1}</h4>
        {canRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove} className="h-7 w-7 p-0">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!isFirst && (
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={dirKind === "absolute"}
              onChange={() => onChange({ direction: { kind: "absolute", dir: "any-8" } })}
            />
            Absolute direction
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={dirKind === "relative"}
              onChange={() => onChange({ direction: { kind: "relative", rel: "any-perp" } })}
            />
            Relative to previous step
          </label>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-2 text-sm">
        <div>
          <Label className="text-xs">Direction</Label>
          {dirKind === "absolute" ? (
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={step.direction.kind === "absolute" ? step.direction.dir : "any-8"}
              onChange={(e) => onChange({ direction: { kind: "absolute", dir: e.target.value as StepDirAbs } })}
            >
              {ABSOLUTE_DIR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={step.direction.kind === "relative" ? step.direction.rel : "same"}
              onChange={(e) => onChange({ direction: { kind: "relative", rel: e.target.value as StepDirRel } })}
            >
              {RELATIVE_DIR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <Label className="text-xs">Distance</Label>
          <select
            className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            value={typeof step.distance === "number" ? String(step.distance) : "unlimited"}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ distance: v === "unlimited" ? "unlimited" : Number(v) });
            }}
          >
            <option value="1">1 square</option>
            <option value="2">2 squares</option>
            <option value="3">3 squares</option>
            <option value="unlimited">Unlimited (continuous)</option>
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={step.jumps}
              onChange={(e) => onChange({ jumps: e.target.checked })}
            />
            Jumps over pieces (not blocked)
          </label>
        </div>
      </div>
    </div>
  );
}
