import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BoardSizePicker } from "@/components/designer/BoardSizePicker";
import { PresetPicker } from "@/components/designer/PresetPicker";
import { PiecePalette } from "@/components/designer/PiecePalette";
import { DesignerBoard } from "@/components/designer/DesignerBoard";
import { Button } from "@/components/ui/button";
import { buildDefaultDesign, PRESETS, saveDesign, validateDesign } from "@/game/design";
import { buildRegistry, PIECE_LIBRARY, STANDARD_PIECE_IDS, BUILTIN_CUSTOM_IDS } from "@/game/pieces";
import type { Color, Design, PieceId, Placement } from "@/game/types";
import { Play, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Design Your Own Chess — Boards, Pieces, Rules" },
      { name: "description", content: "Build your own chess game. Pick the board size (3–12, rectangular OK), drop in pieces, add Dragons, Archers, King's Hands and Barricades, then play against AI." },
      { property: "og:title", content: "Design Your Own Chess" },
      { property: "og:description", content: "A sandbox chess game. You design the board and pieces; the AI plays anything you can imagine." },
    ],
  }),
  component: Designer,
});

function Designer() {
  const navigate = useNavigate();
  const [design, setDesign] = useState<Design>(() => buildDefaultDesign(8, 8, "classic"));
  const [paletteColor, setPaletteColor] = useState<Color>("w");
  const [mirror, setMirror] = useState(true);

  const registry = useMemo(() => buildRegistry(design.customPieces), [design.customPieces]);

  const allPieceDefs = useMemo(() => {
    return [
      ...STANDARD_PIECE_IDS.map((id) => PIECE_LIBRARY[id]),
      ...BUILTIN_CUSTOM_IDS.map((id) => PIECE_LIBRARY[id]),
      ...design.customPieces,
    ];
  }, [design.customPieces]);

  const setSize = (rows: number, cols: number) => {
    setDesign((d) => {
      const placements = d.placements.filter((p) => p.r < rows && p.c < cols);
      return { ...d, rows, cols, placements };
    });
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

  const startGame = () => {
    const err = validateDesign(design, registry);
    if (err) { toast.error(err); return; }
    saveDesign(design);
    navigate({ to: "/play" });
  };

  const validationError = validateDesign(design, registry);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-7xl mx-auto px-4 pt-6 pb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Design Your <span className="text-primary">Chess</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Pick a board size, drop in pieces from the palette, then play your invented game against the AI.
          </p>
        </div>
        <Button onClick={startGame} size="lg" disabled={!!validationError}>
          <Play className="h-4 w-4 mr-2" /> Play
        </Button>
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
          <DesignerBoard
            design={design}
            registry={registry}
            onChange={setPlacements}
            mirror={mirror}
          />
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
              For now, four custom pieces are built-in: King's Hand, Archer, Dragon, Barricade.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
