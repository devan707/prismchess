import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ABSOLUTE_DIR_OPTIONS,
  RELATIVE_DIR_OPTIONS,
  RANGED_TIMING_OPTIONS,
  OPTION_KIND_OPTIONS,
  CONDITION_OPTIONS,
  RANGED_MAX_DISTANCE,
  MAX_RANGED_OPTIONS,
  compileOption,
  compileRangedAttack,
  defaultStep,
  defaultOption,
  defaultRangedAttack,
  defaultRangedAttackOption,
  type MoveOption,
  type MoveOptionKind,
  type MoveCondition,
  type MoveStep,
  type RangedAttack,
  type RangedAttackOption,
  type RangedTiming,
  type StepDirAbs,
  type StepDirRel,
} from "@/game/customMovement";
import { PieceReachPreview } from "./PieceReachPreview";
import { PieceTestBoard } from "./PieceTestBoard";
import { PieceById } from "@/components/chess/PieceGlyph";
import { PieceWorthBadge } from "@/components/pieces/PieceWorthBadge";
import type { PieceDef } from "@/game/types";
import { estimatePiecePoints } from "@/game/pieceValue";
import { requestPieceAbility, savePiece, suggestPieceEmoji, updatePiece, uploadPieceImage } from "@/lib/piece-builder.functions";
import { Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

export interface PieceBuilderInitial {
  pieceId: string;
  slug: string;
  name: string;
  description: string;
  def: PieceDef;
  visibility: "private" | "public";
  imageUrl: string | null;
}

interface Props {
  onSaved?: (pieceId: string, def: PieceDef) => void;
  /** Pre-fill from an existing piece AND save back to that same record (edit
   *  in place). The user's own published games that embed this piece are
   *  auto-refreshed server-side; other people's games stay frozen. */
  initial?: PieceBuilderInitial;
  /** Pre-fill from an existing piece but save as a brand-new piece (duplicate). */
  template?: PieceBuilderInitial;
}

const MAX_STEPS = 4;
const MAX_OPTIONS = 6;

function buildPieceDef(opts: {
  id: string;
  name: string;
  description: string;
  emoji: string;
  options: MoveOption[];
  ranged: RangedAttack;
  pointsOverride?: number;
}): PieceDef | { error: string } {
  if (!opts.options.length) return { error: "Add at least one movement option." };
  for (let i = 0; i < opts.options.length; i++) {
    const c = compileOption(opts.options[i]);
    if (c.error) return { error: `Option ${i + 1}: ${c.error}` };
  }
  const ranged = compileRangedAttack(opts.ranged);
  if (ranged.error) return { error: ranged.error };
  const def: PieceDef = {
    id: opts.id,
    name: opts.name,
    glyph: opts.emoji,
    emoji: true,
    options: opts.options,
    description: opts.description,
    builtinCustom: false,
  };
  if (opts.ranged.enabled && (ranged.spec.leaps?.length ?? 0) > 0) {
    def.rangedCapture = { spec: ranged.spec, timing: opts.ranged.timing };
  }
  if (opts.pointsOverride != null) def.pointsOverride = opts.pointsOverride;
  // Persist the editable source for the ranged attack so re-editing later
  // can restore the exact direction/range bands. Ignored by the engine.
  (def as unknown as { __rangedSource?: RangedAttack }).__rangedSource = opts.ranged;
  return def;
}

function genId(): string {
  return "u:" + Math.random().toString(36).slice(2, 8);
}

function summarizeOption(opt: MoveOption): string {
  const kindLabel =
    opt.kind === "move-only" ? "Move only"
    : opt.kind === "capture-only" ? "Capture only"
    : "Move or capture";
  const s = opt.steps[0];
  let dir = "";
  if (s) {
    const d = s.direction;
    if (d.kind === "absolute") {
      dir = ABSOLUTE_DIR_OPTIONS.find((o) => o.value === d.dir)?.label ?? "";
    } else {
      dir = "relative chain";
    }
  }
  const dist = s ? (s.distance === "unlimited" ? "unlimited" : `${s.distance} sq`) : "";
  const cond = opt.condition === "from-starting-square" ? " · starting only" : "";
  return `${kindLabel} · ${dir} · ${dist}${cond}`;
}

export function PieceBuilderForm({ onSaved, initial, template }: Props) {
  const isEdit = !!initial;
  const seed = initial ?? template;
  const initDef = seed?.def;
  const initRangedSource = (initDef as unknown as { __rangedSource?: RangedAttack } | undefined)?.__rangedSource;
  const hasUploadedImage = !!(seed?.imageUrl || initDef?.imageUrl);
  const [name, setName] = useState(
    initial?.name ?? (template ? `${template.name} (copy)` : ""),
  );
  const [description, setDescription] = useState(seed?.description ?? "");
  const [iconPrompt, setIconPrompt] = useState("");
  const [emoji, setEmoji] = useState(initDef && !hasUploadedImage ? (initDef.glyph || "") : "");
  const [emojiBusy, setEmojiBusy] = useState(false);
  const [imageMode, setImageMode] = useState<"emoji" | "upload">(hasUploadedImage ? "upload" : "emoji");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(seed?.imageUrl ?? initDef?.imageUrl ?? null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [options, setOptions] = useState<MoveOption[]>(
    initDef?.options && initDef.options.length > 0 ? initDef.options : [defaultOption()],
  );
  const [ranged, setRanged] = useState<RangedAttack>(
    initRangedSource
      ? initRangedSource
      : initDef?.rangedCapture
        ? { ...defaultRangedAttack(), enabled: true, timing: initDef.rangedCapture.timing }
        : defaultRangedAttack(),
  );
  const [overrideEnabled, setOverrideEnabled] = useState(initDef?.pointsOverride != null);
  const [overridePts, setOverridePts] = useState<number>(initDef?.pointsOverride ?? 3);
  const [abilityRequest, setAbilityRequest] = useState("");
  const [saving, setSaving] = useState(false);
  const suggest = useServerFn(suggestPieceEmoji);
  const save = useServerFn(savePiece);
  const update = useServerFn(updatePiece);
  const uploadImage = useServerFn(uploadPieceImage);
  const submitAbility = useServerFn(requestPieceAbility);

  // Edit reuses the original piece id; new pieces (including duplicates) get a fresh id.
  const [id] = useState<string>(() => (isEdit && initDef?.id) ? initDef.id : genId());

  const compiledRanged = useMemo(() => compileRangedAttack(ranged), [ranged]);

  const optionError = useMemo(() => {
    if (!options.length) return "Add at least one movement option.";
    for (let i = 0; i < options.length; i++) {
      const c = compileOption(options[i]);
      if (c.error) return `Option ${i + 1}: ${c.error}`;
    }
    return null;
  }, [options]);

  const validation = useMemo(() => {
    if (!name.trim()) return "Name your piece.";
    if (imageMode === "emoji" && !emoji) return "Pick or generate an emoji icon (or upload an image).";
    if (imageMode === "upload" && !imageFile) return "Upload a 300×300 PNG with a transparent background (or use an emoji).";
    if (imageError) return imageError;
    if (optionError) return optionError;
    if (compiledRanged.error) return compiledRanged.error;
    return null;
  }, [name, emoji, imageMode, imageFile, imageError, optionError, compiledRanged]);

  const previewDef: PieceDef = {
    id,
    name: name || "New piece",
    glyph: emoji || "❓",
    emoji: true,
    imageUrl: imageMode === "upload" ? imagePreview ?? undefined : undefined,
    options,
    description,
    rangedCapture: ranged.enabled && (compiledRanged.spec.leaps?.length ?? 0) > 0
      ? { spec: compiledRanged.spec, timing: ranged.timing }
      : undefined,
  };

  const estimatedPts = useMemo(() => estimatePiecePoints(previewDef), [previewDef]);
  const finalPts = overrideEnabled ? overridePts : estimatedPts;

  // Auto-size the reach/playtest boards so far-flung ranged shots stay visible.
  const previewBoardSize = useMemo(() => {
    let maxAbs = 2;
    const consider = (dr: number, dc: number) => {
      maxAbs = Math.max(maxAbs, Math.abs(dr), Math.abs(dc));
    };
    for (const opt of options) {
      const c = compileOption(opt);
      for (const o of c.spec.leaps ?? []) consider(o.dr, o.dc);
      for (const s of c.spec.slides ?? []) {
        const k = s.max && s.max > 0 ? s.max : 4;
        consider(s.dr * k, s.dc * k);
      }
    }
    if (ranged.enabled) {
      for (const o of compiledRanged.spec.leaps ?? []) consider(o.dr, o.dc);
    }
    // Need (2 * maxAbs + 1) cells to keep the center cell + farthest reach visible.
    const needed = 2 * maxAbs + 1;
    // Clamp to a sensible window so the board doesn't get microscopic.
    return Math.min(15, Math.max(9, needed));
  }, [options, ranged.enabled, compiledRanged]);


  const updateOption = (idx: number, patch: Partial<MoveOption>) =>
    setOptions((arr) => arr.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  const updateStep = (optIdx: number, stepIdx: number, patch: Partial<MoveStep>) =>
    setOptions((arr) =>
      arr.map((o, i) =>
        i !== optIdx ? o : { ...o, steps: o.steps.map((s, j) => (j === stepIdx ? { ...s, ...patch } : s)) },
      ),
    );
  const addStep = (optIdx: number) =>
    setOptions((arr) =>
      arr.map((o, i) =>
        i !== optIdx
          ? o
          : {
              ...o,
              steps: [
                ...o.steps,
                { direction: { kind: "relative", rel: "any-perp" }, distance: 1, jumps: true, captures: true },
              ],
            },
      ),
    );
  const removeStep = (optIdx: number, stepIdx: number) =>
    setOptions((arr) =>
      arr.map((o, i) => (i !== optIdx ? o : { ...o, steps: o.steps.filter((_, j) => j !== stepIdx) })),
    );

  const addOption = () => setOptions((arr) => [...arr, defaultOption()]);
  const removeOption = (idx: number) => setOptions((arr) => arr.filter((_, i) => i !== idx));

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

  const handleFile = (file: File | null) => {
    setImageError(null);
    setImageFile(null);
    setImagePreview(null);
    if (!file) return;
    if (file.type !== "image/png") { setImageError("Image must be a PNG."); return; }
    if (file.size > 1_000_000) { setImageError("Image must be under 1 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const img = new Image();
      img.onload = () => {
        if (img.width !== 300 || img.height !== 300) {
          setImageError(`Image must be exactly 300×300 (got ${img.width}×${img.height}).`);
          return;
        }
        setImageFile(file);
        setImagePreview(url);
      };
      img.onerror = () => setImageError("Couldn't read the image.");
      img.src = url;
    };
    reader.onerror = () => setImageError("Couldn't read the image.");
    reader.readAsDataURL(file);
  };

  const doSave = async (visibility: "private" | "public") => {
    if (validation) { toast.error(validation); return; }
    const effectiveEmoji = imageMode === "upload" ? "🖼️" : emoji;
    const def = buildPieceDef({
      id, name: name.trim(), description: description.trim(), emoji: effectiveEmoji, options, ranged,
      pointsOverride: overrideEnabled ? overridePts : undefined,
    });
    if ("error" in def) { toast.error(def.error); return; }
    setSaving(true);
    try {
      const row = isEdit
        ? await update({
            data: {
              pieceId: initial!.pieceId,
              name: name.trim(),
              description: description.trim(),
              def: def as unknown as Record<string, unknown>,
              visibility,
            },
          })
        : await save({
            data: {
              name: name.trim(),
              description: description.trim(),
              def: def as unknown as Record<string, unknown>,
              visibility,
              // Preserve original-author credit when this is a remix/duplicate.
              remixedFromId: template?.pieceId ?? null,
            },
          });

      if (imageMode === "upload" && imageFile) {
        const fd = new FormData();
        fd.set("pieceId", row.id);
        fd.set("file", imageFile, "piece.png");
        const res = await uploadImage({ data: fd });
        def.imageUrl = res.imageUrl;
      }

      if (abilityRequest.trim()) {
        try {
          await submitAbility({ data: { pieceId: row.id, requestText: abilityRequest.trim() } });
          toast.success("Special ability request submitted for review.");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't submit ability request.");
        }
      }

      if (isEdit) {
        const refreshed = (row as { refreshedGames?: number }).refreshedGames ?? 0;
        toast.success(
          refreshed > 0
            ? `Saved "${name.trim()}" — also refreshed in ${refreshed} of your published variant${refreshed === 1 ? "" : "s"}.`
            : `Saved changes to "${name.trim()}". Other people's games keep their original snapshot.`,
        );
      } else {
        toast.success(
          visibility === "public"
            ? `Published "${name.trim()}" to the community library`
            : `Saved "${name.trim()}" to your library`,
        );
      }
      onSaved?.(row.id, def);
      if (!isEdit) {
        // Reset for the next piece (creation mode only).
        setName(""); setDescription(""); setIconPrompt(""); setEmoji("");
        setImageMode("emoji"); setImageFile(null); setImagePreview(null); setImageError(null);
        setOptions([defaultOption()]);
        setRanged(defaultRangedAttack());
        setOverrideEnabled(false);
        setOverridePts(3);
        setAbilityRequest("");
      }
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
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setImageMode("emoji")}
              className={`px-3 py-1 rounded-md border ${imageMode === "emoji" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
            >
              AI emoji
            </button>
            <button
              type="button"
              onClick={() => setImageMode("upload")}
              className={`px-3 py-1 rounded-md border ${imageMode === "upload" ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
            >
              Upload PNG
            </button>
          </div>

          {imageMode === "emoji" ? (
            <>
              <p className="text-xs text-muted-foreground">
                Describe what the piece looks like — the AI picks one emoji rendered in the same black-and-white style as built-in pieces.
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
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Upload your own art. Required: <strong>PNG</strong>, exactly <strong>300×300 pixels</strong>,{" "}
                <strong>transparent background</strong>. Max 1 MB. It will be rendered in your side's color (silhouette filter).
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/png"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  className="text-xs"
                />
                {imageFile && (
                  <Button size="sm" variant="ghost" onClick={() => handleFile(null)}>Clear</Button>
                )}
              </div>
              {imageError && <p className="text-xs text-destructive">{imageError}</p>}
              {imagePreview && !imageError && (
                <p className="text-xs text-muted-foreground">
                  Ready: <span className="font-mono">{imageFile?.name}</span> · {(imageFile!.size / 1024).toFixed(0)} KB
                </p>
              )}
            </>
          )}
        </section>

        {/* Movement options */}
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="font-display text-lg font-semibold">3. Movement options</h2>
          <p className="text-xs text-muted-foreground">
            Add one or more <strong>alternative moves</strong>. Each option is its own pattern with a kind
            (move-or-capture, move-only, capture-only) and an optional condition. A pawn, for example, is
            three options: forward push (move-only), two-square first push (move-only · starting only), and
            diagonal capture (capture-only).
          </p>
          <div className="space-y-3">
            {options.map((opt, idx) => (
              <OptionCard
                key={idx}
                idx={idx}
                option={opt}
                canRemove={options.length > 1}
                onChange={(patch) => updateOption(idx, patch)}
                onRemove={() => removeOption(idx)}
                onStepChange={(stepIdx, patch) => updateStep(idx, stepIdx, patch)}
                onAddStep={() => addStep(idx)}
                onRemoveStep={(stepIdx) => removeStep(idx, stepIdx)}
              />
            ))}
          </div>
          {options.length < MAX_OPTIONS && (
            <Button variant="outline" size="sm" onClick={addOption}>
              <Plus className="h-4 w-4 mr-1" /> Add alternative move
            </Button>
          )}
        </section>

        {/* Ranged attack */}
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="font-display text-lg font-semibold">4. Ranged attack (optional)</h2>
          <p className="text-xs text-muted-foreground">
            Like the Archer: capture an enemy at distance <em>without moving</em>. Arrows fly over intervening
            pieces. For an Archer, use diagonal · 2–3 squares · instead of movement.
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={ranged.enabled}
              onChange={(e) => setRanged((r) => ({ ...r, enabled: e.target.checked }))}
            />
            Enable a ranged attack
          </label>
          {ranged.enabled && (
            <div className="space-y-3 text-sm">
              <div>
                <Label className="text-xs">When fired</Label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                  value={ranged.timing}
                  onChange={(e) => setRanged((r) => ({ ...r, timing: e.target.value as RangedTiming }))}
                >
                  {RANGED_TIMING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {RANGED_TIMING_OPTIONS.find((o) => o.value === ranged.timing)?.hint}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Attack patterns</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={ranged.options.length >= MAX_RANGED_OPTIONS}
                    onClick={() => setRanged((r) => ({
                      ...r,
                      options: [...r.options, defaultRangedAttackOption()],
                    }))}
                  >
                    <Plus className="size-3.5 mr-1" /> Add pattern
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Each pattern adds a direction + distance band (e.g. North 2–3, NE 3–4). The piece can fire
                  at any square covered by any pattern.
                </p>
                {ranged.options.map((opt, idx) => {
                  const updateOpt = (patch: Partial<RangedAttackOption>) =>
                    setRanged((r) => ({
                      ...r,
                      options: r.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
                    }));
                  const removeOpt = () =>
                    setRanged((r) => ({
                      ...r,
                      options: r.options.filter((_, i) => i !== idx),
                    }));
                  const distOptions = Array.from({ length: RANGED_MAX_DISTANCE }, (_, i) => i + 1);
                  return (
                    <div key={idx} className="rounded-md border bg-background/40 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Pattern {idx + 1}</span>
                        {ranged.options.length > 1 && (
                          <Button type="button" size="sm" variant="ghost" onClick={removeOpt}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="grid sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[11px]">Direction</Label>
                          <select
                            className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                            value={opt.direction}
                            onChange={(e) => updateOpt({ direction: e.target.value as StepDirAbs })}
                          >
                            {ABSOLUTE_DIR_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-[11px]">Min distance</Label>
                          <select
                            className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                            value={String(opt.minDistance)}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              updateOpt({ minDistance: v, maxDistance: Math.max(v, opt.maxDistance) });
                            }}
                          >
                            {distOptions.map((n) => (
                              <option key={n} value={n}>{n} sq</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-[11px]">Max distance</Label>
                          <select
                            className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                            value={String(opt.maxDistance)}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              updateOpt({ maxDistance: v, minDistance: Math.min(v, opt.minDistance) });
                            }}
                          >
                            {distOptions.map((n) => (
                              <option key={n} value={n}>{n} sq</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Special request (ability or general) */}
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="font-display text-lg font-semibold">5. Special request (optional, requires review)</h2>
          <p className="text-xs text-muted-foreground">
            Want something we don't support yet? Describe it here and a reviewer will take a look. Examples:
            <em> a special ability</em> (resurrection, swapping, once-per-game effects),
            <em> a custom animation</em> (a glowing arrow on a ranged attack, a shadow trail on a leap),
            <em> a sound effect</em>, or <em> a new visual touch</em>. Your piece is fully playable regardless.
          </p>
          <Textarea
            value={abilityRequest}
            onChange={(e) => setAbilityRequest(e.target.value.slice(0, 800))}
            placeholder="e.g. Add a glowing arrow animation for the ranged attack. Or: once per game, may resurrect a friendly pawn on an adjacent empty square."
            maxLength={800}
            rows={3}
          />
          <p className="text-[11px] text-muted-foreground text-right">{abilityRequest.length} / 800</p>
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
            <PieceReachPreview
              options={options}
              rangedSpec={ranged.enabled ? compiledRanged.spec : undefined}
              size={previewBoardSize}
            />
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-semibold mb-1">Playtest</p>
            <p className="text-[11px] text-muted-foreground mb-2">
              Drop allies/enemies, then click your piece to see legal moves and try captures, blocks, and slides.
              {ranged.enabled && " Orange squares show ranged reach — drop an enemy on one to fire."}
            </p>
            <PieceTestBoard
              def={previewDef}
              options={options}
              rangedSpec={ranged.enabled ? compiledRanged.spec : undefined}
              size={previewBoardSize}
            />
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
              {isEdit ? "Save changes (private)" : "Save private"}
            </Button>
            <Button className="w-full" disabled={!!validation || saving} onClick={() => doSave("public")}>
              {isEdit ? "Save changes (public)" : "Publish public"}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

interface OptionCardProps {
  idx: number;
  option: MoveOption;
  canRemove: boolean;
  onChange: (patch: Partial<MoveOption>) => void;
  onRemove: () => void;
  onStepChange: (stepIdx: number, patch: Partial<MoveStep>) => void;
  onAddStep: () => void;
  onRemoveStep: (stepIdx: number) => void;
}

function OptionCard({ idx, option, canRemove, onChange, onRemove, onStepChange, onAddStep, onRemoveStep }: OptionCardProps) {
  return (
    <div className="rounded-md border bg-background p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Option {idx + 1}</h4>
          <p className="text-[11px] text-muted-foreground truncate">{summarizeOption(option)}</p>
        </div>
        {canRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove} className="h-7 w-7 p-0">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-2 text-sm">
        <div>
          <Label className="text-xs">Kind</Label>
          <select
            className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            value={option.kind}
            onChange={(e) => onChange({ kind: e.target.value as MoveOptionKind })}
          >
            {OPTION_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">
            {OPTION_KIND_OPTIONS.find((o) => o.value === option.kind)?.hint}
          </p>
        </div>
        <div>
          <Label className="text-xs">Condition</Label>
          <select
            className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            value={option.condition}
            onChange={(e) => onChange({ condition: e.target.value as MoveCondition })}
          >
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {option.steps.map((step, stepIdx) => (
          <StepRow
            key={stepIdx}
            idx={stepIdx}
            step={step}
            canRemove={option.steps.length > 1}
            onChange={(patch) => onStepChange(stepIdx, patch)}
            onRemove={() => onRemoveStep(stepIdx)}
          />
        ))}
        {option.steps.length < MAX_STEPS && (
          <Button variant="outline" size="sm" onClick={onAddStep}>
            <Plus className="h-4 w-4 mr-1" /> Add step
          </Button>
        )}
      </div>
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
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {idx + 1}</h5>
        {canRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove} className="h-7 w-7 p-0">
            <Trash2 className="h-3 w-3" />
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
            Absolute
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={dirKind === "relative"}
              onChange={() => onChange({ direction: { kind: "relative", rel: "any-perp" } })}
            />
            Relative to previous
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
            Jumps over pieces
          </label>
        </div>
      </div>
    </div>
  );
}
