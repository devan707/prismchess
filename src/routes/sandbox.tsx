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
import type { Color, Design, PieceId, Placement, Square } from "@/game/types";
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
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<PieceId | "erase" | null>(null);

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

  const applyPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setDesign((d) => ({ ...d, placements: preset.build(d.rows, d.cols) }));
    setSelectedSquare(null);
  };

  const setPlacements = (placements: Placement[]) => setDesign((d) => ({ ...d, placements }));

  const setReserve = (pieceId: PieceId, color: Color, count: number) => {
    setDesign((d) => ({
      ...d,
      reserves: { ...d.reserves, [color]: { ...d.reserves[color], [pieceId]: count } },
    }));
  };

  /** Write a piece (or empty) at a square, honoring mirror. */
  const writeAt = (sq: Square, pieceId: PieceId | null, color: Color) => {
    const { rows, cols } = design;
    const wide = cols > rows;
    const filtered = design.placements.filter((p) => !(p.r === sq.r && p.c === sq.c));
    const mirrored = mirror
      ? wide
        ? filtered.filter((p) => !(p.r === sq.r && p.c === cols - 1 - sq.c))
        : filtered.filter((p) => !(p.r === rows - 1 - sq.r && p.c === sq.c))
      : filtered;
    const next: Placement[] = mirrored;
    if (pieceId) next.push({ r: sq.r, c: sq.c, pieceId, color });
    if (mirror && pieceId) {
      if (wide) {
        next.push({ r: sq.r, c: cols - 1 - sq.c, pieceId, color: color === "w" ? "b" : "w" });
      } else {
        next.push({ r: rows - 1 - sq.r, c: sq.c, pieceId, color: color === "w" ? "b" : "w" });
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
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Sandbox</h1>
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
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <h3 className="font-display text-sm font-semibold">Custom pieces</h3>
            <p className="text-[11px] text-muted-foreground">
              Seven custom pieces are built-in: King's Hand, Archer, Dragon, Barricade,
              Portal (swap with a friendly piece), Necromancer (resurrect a captured ally),
              and Shapeshifter Pawn (transforms into whatever it captures). User-defined pieces are coming soon.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
