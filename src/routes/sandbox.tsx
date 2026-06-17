import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BoardSizePicker } from "@/components/designer/BoardSizePicker";
import { PresetPicker } from "@/components/designer/PresetPicker";
import { PiecePalette } from "@/components/designer/PiecePalette";
import { DesignerBoard } from "@/components/designer/DesignerBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildDefaultDesign, PRESETS, saveDesign, validateDesign } from "@/game/design";
import { saveSavedGame } from "@/game/library";
import { buildRegistry, PIECE_LIBRARY, STANDARD_PIECE_IDS, BUILTIN_CUSTOM_IDS } from "@/game/pieces";
import type { Color, Design, PieceId, Placement } from "@/game/types";
import { ArrowLeft, Play, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/sandbox")({
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
  const [design, setDesign] = useState<Design>(() => buildDefaultDesign(8, 8, "classic"));
  const [paletteColor, setPaletteColor] = useState<Color>("w");
  const [mirror, setMirror] = useState(true);
  const [saveName, setSaveName] = useState("");

  const registry = useMemo(() => buildRegistry(design.customPieces), [design.customPieces]);

  const allPieceDefs = useMemo(() => [
    ...STANDARD_PIECE_IDS.map((id) => PIECE_LIBRARY[id]),
    ...BUILTIN_CUSTOM_IDS.map((id) => PIECE_LIBRARY[id]),
    ...design.customPieces,
  ], [design.customPieces]);

  const setSize = (rows: number, cols: number) => {
    setDesign((d) => ({ ...d, rows, cols, placements: d.placements.filter((p) => p.r < rows && p.c < cols) }));
  };

  const applyPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setDesign((d) => ({ ...d, placements: preset.build(d.rows, d.cols) }));
  };

  const setPlacements = (placements: Placement[]) => setDesign((d) => ({ ...d, placements }));

  const setReserve = (pieceId: PieceId, color: Color, count: number) => {
    setDesign((d) => ({
      ...d,
      reserves: { ...d.reserves, [color]: { ...d.reserves[color], [pieceId]: count } },
    }));
  };

  const validationError = validateDesign(design, registry);

  const startGame = () => {
    if (validationError) { toast.error(validationError); return; }
    saveDesign(design);
    navigate({ to: "/play" });
  };

  const handleSave = () => {
    if (validationError) { toast.error(validationError); return; }
    const name = saveName.trim() || `Custom ${design.rows}×${design.cols}`;
    saveSavedGame(name, design);
    toast.success(`Saved "${name}"`);
    setSaveName("");
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
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Sandbox
            </h1>
            <p className="text-xs text-muted-foreground">Design a board, save it, then play it.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this game"
            className="h-9 w-44"
          />
          <Button onClick={handleSave} variant="outline" size="sm" disabled={!!validationError}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
          <Button onClick={startGame} size="sm" disabled={!!validationError}>
            <Play className="h-4 w-4 mr-1" /> Play
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pb-12 grid gap-4 lg:grid-cols-[260px_1fr_300px]">
        <aside className="space-y-3">
          <BoardSizePicker rows={design.rows} cols={design.cols} onChange={setSize} />
          <PresetPicker onApply={applyPreset} />
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
          <DesignerBoard design={design} registry={registry} onChange={setPlacements} mirror={mirror} />
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
          />
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <h3 className="font-display text-sm font-semibold">Custom pieces</h3>
            <p className="text-[11px] text-muted-foreground">
              Coming soon: name a piece, choose an icon, define its movement and capture pattern.
              Four custom pieces are built-in today: King's Hand, Archer, Dragon, Barricade.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
