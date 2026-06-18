import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BoardSizePicker } from "@/components/designer/BoardSizePicker";
import { PresetPicker } from "@/components/designer/PresetPicker";
import { PiecePalette } from "@/components/designer/PiecePalette";
import { DesignerBoard } from "@/components/designer/DesignerBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  buildDefaultDesign,
  buildUserPresetPlacements,
  deleteUserPreset,
  extractPresetFromDesign,
  juggPartnerCandidates,
  loadUserPresets,
  PRESETS,
  saveCurrentMeta,
  saveDesign,
  upsertUserPreset,
  validateDesign,
  type UserPreset,
} from "@/game/design";
import { saveSavedGame } from "@/game/library";
import { buildBaseTutorial, type GameTutorial } from "@/game/tutorials";
import { buildRegistry, PIECE_LIBRARY, STANDARD_PIECE_IDS, BUILTIN_CUSTOM_IDS } from "@/game/pieces";
import type { Color, Design, PieceId, Placement, Square } from "@/game/types";
import { ArrowLeft, Play, Save, Sparkles, Wand2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateGameTutorial, suggestGameDescription } from "@/lib/tutorial.functions";
import { publishGame, getMyPublishedGame, getPublishedGame } from "@/lib/social.functions";
import { PieceLibraryPanel } from "@/components/pieces/PieceLibraryPanel";

export const Route = createFileRoute("/sandbox")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
    duplicate: typeof search.duplicate === "string" ? search.duplicate : undefined,
    remix: typeof search.remix === "string" ? search.remix : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sandbox — Design Your Own Chess" },
      { name: "description", content: "Design custom chess boards and pieces. Save your inventions and play them against the AI." },
    ],
  }),
  component: Sandbox,
});

function Sandbox() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [design, setDesign] = useState<Design>(() => buildDefaultDesign(8, 8, "classic"));
  const [paletteColor, setPaletteColor] = useState<Color>("w");
  const [mirror, setMirror] = useState(true);
  const [saveName, setSaveName] = useState("");
  const [description, setDescription] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<PieceId | "erase" | null>(null);
  const suggestDesc = useServerFn(suggestGameDescription);
  const genTutorial = useServerFn(generateGameTutorial);
  const publish = useServerFn(publishGame);
  const fetchMyGame = useServerFn(getMyPublishedGame);
  const fetchPublicGame = useServerFn(getPublishedGame);
  const [publishing, setPublishing] = useState(false);
  const [publishedGameId, setPublishedGameId] = useState<string | null>(null);

  // ?edit=<gameId>    → owner edit: updates the same listing on Publish.
  // ?duplicate=<gameId> → owner duplicate: hydrate then save as NEW.
  // ?remix=<slug>     → public remix: hydrate from any published variant
  //                     (yours or someone else's) and save as a NEW listing.
  useEffect(() => {
    const sourceId = search.edit ?? search.duplicate;
    const remixSlug = search.remix;
    if (!sourceId && !remixSlug) return;
    const isDuplicate = !!search.duplicate;
    const isRemix = !!remixSlug;
    let cancelled = false;
    (async () => {
      try {
        let row: { id: string; name: string; description: string; design: unknown } | null = null;
        if (remixSlug) {
          const res = await fetchPublicGame({ data: { slug: remixSlug } });
          if (res?.game) row = { id: res.game.id, name: res.game.name, description: res.game.description, design: res.game.design };
        } else if (sourceId) {
          const mine = await fetchMyGame({ data: { gameId: sourceId } });
          if (mine) row = mine as unknown as typeof row;
        }
        if (cancelled || !row) return;
        setDesign(row.design as unknown as Design);
        setSaveName((isDuplicate || isRemix) ? `${row.name} (remix)` : row.name);
        setDescription(row.description);
        setPublishedGameId((isDuplicate || isRemix) ? null : row.id);
        toast.info(
          isRemix
            ? `Remixing "${row.name}" — tweak the design and publish as your own variant.`
            : isDuplicate
              ? `Duplicating "${row.name}" — rename and tweak before publishing.`
              : `Editing "${row.name}" — Publish will update this listing.`,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load that game");
      }
    })();
    return () => { cancelled = true; };
  }, [search.edit, search.duplicate, search.remix, fetchMyGame, fetchPublicGame]);


  const registry = useMemo(() => buildRegistry(design.customPieces), [design.customPieces]);

  const allPieceDefs = useMemo(() => [
    ...STANDARD_PIECE_IDS.map((id) => PIECE_LIBRARY[id]),
    ...BUILTIN_CUSTOM_IDS.map((id) => PIECE_LIBRARY[id]),
    ...design.customPieces,
  ], [design.customPieces]);

  const setSize = (rows: number, cols: number) => {
    setDesign((d) => ({ ...d, rows, cols, placements: d.placements.filter((p) => p.r < rows && p.c < cols) }));
    setSelectedSquare(null);
  };


  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => {
    if (typeof window === "undefined") return [];
    return loadUserPresets();
  });

  const applyPreset = (id: string) => {
    if (id.startsWith("user:")) {
      const uid = id.slice(5);
      const preset = userPresets.find((p) => p.id === uid);
      if (!preset) return;
      setDesign((d) => ({ ...d, placements: buildUserPresetPlacements(preset, d.rows, d.cols) }));
      setSelectedSquare(null);
      return;
    }
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setDesign((d) => ({ ...d, placements: preset.build(d.rows, d.cols) }));
    setSelectedSquare(null);
  };

  const saveCurrentAsPreset = (name: string) => {
    const preset = extractPresetFromDesign(design, name);
    if (preset.backRank.length === 0) {
      toast.error("Place at least one piece on White's back rank before saving a layout.");
      return;
    }
    const next = upsertUserPreset(preset);
    setUserPresets(next);
    toast.success(`Saved layout "${name}"`);
  };

  const renameUserPreset = (id: string, name: string) => {
    const existing = userPresets.find((p) => p.id === id);
    if (!existing) return;
    const next = upsertUserPreset({ ...existing, name });
    setUserPresets(next);
  };

  const removeUserPreset = (id: string) => {
    const next = deleteUserPreset(id);
    setUserPresets(next);
    toast.success("Layout deleted.");
  };


  const swapPawns = (from: PieceId, to: PieceId) => {
    setDesign((d) => {
      const count = d.placements.filter((p) => p.pieceId === from).length;
      if (count === 0) {
        toast.info(`No ${from === "P" ? "regular pawns" : "shapeshifter pawns"} to swap.`);
        return d;
      }
      toast.success(`Swapped ${count} ${from === "P" ? "pawn" : "shapeshifter"}${count === 1 ? "" : "s"}.`);
      return {
        ...d,
        placements: d.placements.map((p) => (p.pieceId === from ? { ...p, pieceId: to } : p)),
      };
    });
    setSelectedSquare(null);
  };


  const setPlacements = (placements: Placement[]) => setDesign((d) => ({ ...d, placements }));


  const setReserve = (pieceId: PieceId, color: Color, count: number) => {
    setDesign((d) => ({
      ...d,
      reserves: { ...d.reserves, [color]: { ...d.reserves[color], [pieceId]: count } },
    }));
  };

  /** Write a piece (or empty) at a square, honoring mirror. Juggernauts auto-place their partner. */
  const writeAt = (sq: Square, pieceId: PieceId | null, color: Color) => {
    const { rows, cols } = design;
    const wide = cols > rows;
    const mirrorOf = (s: Square): Square =>
      wide ? { r: s.r, c: cols - 1 - s.c } : { r: rows - 1 - s.r, c: s.c };

    // Cells we want to clear before writing (so re-clicks toggle cleanly).
    const cellsToClear: Square[] = [sq];
    if (mirror) cellsToClear.push(mirrorOf(sq));

    let next: Placement[] = design.placements.filter(
      (p) => !cellsToClear.some((s) => s.r === p.r && s.c === p.c),
    );

    if (pieceId === "J") {
      // Place primary pair
      for (const o of juggPartnerCandidates(rows, cols)) {
        const pr = sq.r + o.dr, pc = sq.c + o.dc;
        if (pr < 0 || pr >= rows || pc < 0 || pc >= cols) continue;
        if (next.some((p) => p.r === pr && p.c === pc)) continue;
        next = next.filter((p) => !(p.r === sq.r && p.c === sq.c));
        next.push({ r: sq.r, c: sq.c, pieceId: "J", color });
        next.push({ r: pr, c: pc, pieceId: "J", color });
        if (mirror) {
          const mSq = mirrorOf(sq);
          const mPartner = mirrorOf({ r: pr, c: pc });
          const mColor: Color = color === "w" ? "b" : "w";
          // Clear any existing pieces on mirror cells
          next = next.filter((p) =>
            !(p.r === mSq.r && p.c === mSq.c) && !(p.r === mPartner.r && p.c === mPartner.c),
          );
          next.push({ r: mSq.r, c: mSq.c, pieceId: "J", color: mColor });
          next.push({ r: mPartner.r, c: mPartner.c, pieceId: "J", color: mColor });
        }
        setPlacements(next);
        return;
      }
      toast.error("No adjacent square available to pair the Juggernaut.");
      return;
    }

    if (pieceId) {
      next.push({ r: sq.r, c: sq.c, pieceId, color });
      if (mirror) {
        const mSq = mirrorOf(sq);
        next.push({ r: mSq.r, c: mSq.c, pieceId, color: color === "w" ? "b" : "w" });
      }
    }
    setPlacements(next);
  };

  /** Click-to-edit orchestration */
  const handleSelectSquare = (sq: Square | null) => {
    if (!sq) { setSelectedSquare(null); return; }
    if (selectedPiece) {
      writeAt(sq, selectedPiece === "erase" ? null : selectedPiece, paletteColor);
      setSelectedPiece(null);
      setSelectedSquare(null);
      return;
    }
    setSelectedSquare(sq);
  };

  const handleSelectPiece = (id: PieceId | "erase" | null) => {
    if (selectedSquare && id) {
      writeAt(selectedSquare, id === "erase" ? null : id, paletteColor);
      setSelectedSquare(null);
      setSelectedPiece(null);
      return;
    }
    setSelectedPiece(id);
  };

  const clearSelectedSquare = () => {
    if (!selectedSquare) return;
    writeAt(selectedSquare, null, paletteColor);
    setSelectedSquare(null);
  };

  const validationError = validateDesign(design, registry);

  /** Build a piece legend string for the AI prompt: "P=Pawn, K=King, ..." */
  const buildPieceLegend = (): string => {
    const ids = Array.from(new Set(design.placements.map((p) => p.pieceId)));
    return ids
      .map((id) => {
        const def = registry[id] ?? PIECE_LIBRARY[id];
        return def ? `${id}=${def.name}` : id;
      })
      .join(", ");
  };

  const customPiecesPresent = useMemo(() => {
    const present = new Set(design.placements.map((p) => p.pieceId));
    return Array.from(present)
      .filter((id) => !STANDARD_PIECE_IDS.includes(id as PieceId))
      .map((id) => {
        const def = registry[id] ?? PIECE_LIBRARY[id];
        return { id, name: def?.name ?? id, description: def?.description };
      });
  }, [design.placements, registry]);

  const handleAiDescription = async () => {
    if (validationError) { toast.error(validationError); return; }
    setAiBusy(true);
    try {
      const res = await suggestDesc({
        data: {
          name: saveName.trim() || `Custom ${design.rows}×${design.cols}`,
          pieceLegend: buildPieceLegend(),
          rows: design.rows,
          cols: design.cols,
        },
      });
      if (res.ok) {
        setDescription(res.description);
        toast.success("Description suggested by AI.");
      } else {
        toast.error(res.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed.");
    } finally {
      setAiBusy(false);
    }
  };

  /** Try AI tutorial generation; fall back to the programmatic builder on any failure. */
  const buildTutorialBestEffort = async (name: string, desc: string): Promise<GameTutorial> => {
    try {
      const res = await genTutorial({
        data: {
          name,
          description: desc,
          pieceLegend: buildPieceLegend(),
          rows: design.rows,
          cols: design.cols,
          customPieces: customPiecesPresent,
        },
      });
      if (res.ok) return { slides: res.slides, generatedBy: "ai" };
    } catch {
      // fall through to programmatic builder
    }
    return { ...buildBaseTutorial({ name, description: desc, design }), generatedBy: "fallback" };
  };

  const startGame = async () => {
    if (validationError) { toast.error(validationError); return; }
    const name = saveName.trim() || `Custom ${design.rows}×${design.cols}`;
    saveDesign(design);
    saveCurrentMeta({
      id: `draft:${design.rows}x${design.cols}:${design.placements.length}`,
      name,
      description,
      tutorial: buildBaseTutorial({ name, description, design }),
    });
    navigate({ to: "/play" });
  };

  const handleSave = async () => {
    if (validationError) { toast.error(validationError); return; }
    const name = saveName.trim() || `Custom ${design.rows}×${design.cols}`;
    const desc = description.trim();
    if (!desc) {
      toast.error("Add a description so other players know what makes this game special. You can ask the AI to help.");
      return;
    }
    setSaving(true);
    try {
      toast.info("Saving — generating tutorial slides…");
      const tutorial = await buildTutorialBestEffort(name, desc);
      saveSavedGame(name, design, { description: desc, tutorial });
      toast.success(`Saved "${name}"`);
      setSaveName("");
      setDescription("");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (validationError) { toast.error(validationError); return; }
    const name = saveName.trim() || `Custom ${design.rows}×${design.cols}`;
    const desc = description.trim();
    if (!desc) {
      toast.error("Add a description before sharing — players need to know how the game works.");
      return;
    }
    setPublishing(true);
    try {
      toast.info("Publishing — generating tutorial…");
      const tutorial = await buildTutorialBestEffort(name, desc);
      const res = await publish({
        data: {
          gameId: publishedGameId,
          name,
          description: desc,
          design: design as unknown as Record<string, unknown>,
          tutorial: (tutorial ?? null) as unknown as Record<string, unknown> | null,
        },
      });
      setPublishedGameId(res.id);
      const url = `${window.location.origin}/g/${res.slug}`;
      try { await navigator.clipboard.writeText(url); } catch {}
      toast.success(res.updated ? "Updated! Your published variant is refreshed." : "Published! Share link copied to clipboard.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't publish");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-7xl mx-auto px-4 pt-6 pb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Menu
            </Button>
          </Link>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Sandbox</h1>
            <p className="text-xs text-muted-foreground">Design a board, describe it, then save or play.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this game"
            className="h-9 w-44"
          />
          <Button onClick={handleSave} variant="outline" size="sm" disabled={!!validationError || saving || publishing} title="Save privately to your own library — only you can play it">
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save private"}
          </Button>
          <Button onClick={handlePublish} variant="outline" size="sm" disabled={!!validationError || saving || publishing} title={publishedGameId ? "Update your existing published listing instead of creating a new one" : "Publish publicly to the community gallery so others can discover and play it"}>
            <Share2 className="h-4 w-4 mr-1" /> {publishing ? (publishedGameId ? "Updating…" : "Publishing…") : (publishedGameId ? "Update published" : "Publish public")}
          </Button>
          <Button onClick={startGame} size="sm" disabled={!!validationError}>
            <Play className="h-4 w-4 mr-1" /> Play
          </Button>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 pb-2">
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="game-desc" className="text-sm font-display font-semibold">
              Game description
              <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">Required to save</span>
            </Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleAiDescription}
              disabled={aiBusy || !!validationError}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1" /> {aiBusy ? "Thinking…" : "AI assist"}
            </Button>
          </div>
          <Textarea
            id="game-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder="What makes this variant fun? Mention the board, custom pieces, and any unusual goals."
            className="min-h-[72px] resize-y text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            We use this to generate an AI tutorial that appears the first time someone plays your game.
          </p>
        </div>
      </section>


      <main className="max-w-7xl mx-auto px-4 pb-12 grid gap-4 lg:grid-cols-[260px_1fr_300px]">
        <aside className="space-y-3">
          <BoardSizePicker rows={design.rows} cols={design.cols} onChange={setSize} />
          <PresetPicker
            onApply={applyPreset}
            userPresets={userPresets}
            onSaveCurrentAsPreset={saveCurrentAsPreset}
            onRenameUserPreset={renameUserPreset}
            onDeleteUserPreset={removeUserPreset}
          />
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <h3 className="font-display text-sm font-semibold">Pawn swap</h3>
            <p className="text-[11px] text-muted-foreground">
              Convert every pawn currently on the board to (or from) a Shapeshifter Pawn.
            </p>
            <div className="flex flex-col gap-1.5">
              <Button size="sm" variant="outline" onClick={() => swapPawns("P", "S")}>
                Pawns → Shapeshifters
              </Button>
              <Button size="sm" variant="outline" onClick={() => swapPawns("S", "P")}>
                Shapeshifters → Pawns
              </Button>
            </div>
          </div>
        </aside>


        <section className="flex flex-col items-center gap-3">
          <div className="w-full flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {design.rows} × {design.cols} · {design.placements.length} pieces placed
            </span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
              Mirror to Black
            </label>
          </div>
          <DesignerBoard
            design={design}
            registry={registry}
            onChange={setPlacements}
            mirror={mirror}
            selectedSquare={selectedSquare}
            onSelectSquare={handleSelectSquare}
          />
          {selectedSquare && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                Square selected — pick a piece on the right, or
              </span>
              <Button size="sm" variant="outline" onClick={clearSelectedSquare}>Clear square</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedSquare(null)}>Cancel</Button>
            </div>
          )}
          {validationError && (
            <div className="text-xs text-destructive flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> {validationError}
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <PiecePalette
            pieces={allPieceDefs}
            color={paletteColor}
            onColorChange={setPaletteColor}
            reserves={design.reserves}
            onReserveChange={setReserve}
            selectedPiece={selectedPiece}
            onSelectPiece={handleSelectPiece}
            hasSquareSelected={!!selectedSquare}
          />
          <PieceLibraryPanel
            alreadyInDesign={design.customPieces.map((p) => p.id)}
            onAdd={(def) => {
              setDesign((d) => ({
                ...d,
                customPieces: d.customPieces.some((p) => p.id === def.id)
                  ? d.customPieces
                  : [...d.customPieces, def],
              }));
            }}
          />
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <h3 className="font-display text-sm font-semibold">Built-in custom pieces</h3>
            <p className="text-[11px] text-muted-foreground">
              Eleven custom pieces ship with the app: King's Hand, Archer, Dragon, Barricade, Portal, Necromancer, Shapeshifter Pawn, Juggernaut, Assassin, Wizard, and Prism. Hover any piece in the palette for details.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
