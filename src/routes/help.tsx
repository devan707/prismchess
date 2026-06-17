import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, Play } from "lucide-react";
import {
  BUILTIN_GAMES,
  loadSavedGames,
  tutorialForBuiltin,
  tutorialForSaved,
  type GameType,
  type SavedGame,
} from "@/game/library";
import { saveCurrentMeta, saveDesign } from "@/game/design";
import { TutorialDialog } from "@/components/TutorialDialog";
import { resetTutorialSeen } from "@/lib/tutorial-state";
import type { GameTutorial } from "@/game/tutorials";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help — Prism Chess" },
      { name: "description", content: "Tutorials, game guides, and tips for every Prism Chess variant." },
    ],
  }),
  component: HelpPage,
});

interface Open {
  gameId: string;
  gameName: string;
  tutorial: GameTutorial;
}

function HelpPage() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState<SavedGame[]>([]);
  const [open, setOpen] = useState<Open | null>(null);

  useEffect(() => { setSaved(loadSavedGames()); }, []);

  const builtins = useMemo(
    () => BUILTIN_GAMES.map((g) => ({ id: `builtin:${g.id}`, g })),
    [],
  );

  const viewBuiltin = (g: GameType) => {
    const id = `builtin:${g.id}`;
    resetTutorialSeen(id);
    setOpen({ gameId: id, gameName: g.name, tutorial: tutorialForBuiltin(g) });
  };
  const viewSaved = (g: SavedGame) => {
    const id = `saved:${g.id}`;
    resetTutorialSeen(id);
    setOpen({ gameId: id, gameName: g.name, tutorial: tutorialForSaved(g) });
  };

  const playBuiltin = (g: GameType) => {
    saveDesign(g.build());
    saveCurrentMeta({ id: `builtin:${g.id}`, name: g.name, description: g.description, tutorial: tutorialForBuiltin(g) });
    navigate({ to: "/play" });
  };
  const playSaved = (g: SavedGame) => {
    saveDesign(g.design);
    saveCurrentMeta({ id: `saved:${g.id}`, name: g.name, description: g.description, tutorial: tutorialForSaved(g) });
    navigate({ to: "/play" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-4xl mx-auto px-4 pt-6 pb-4 flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Menu
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Help & tutorials</h1>
          <p className="text-sm text-muted-foreground">Learn how each game works before you jump in.</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pb-16 space-y-10">
        <section>
          <h2 className="font-display text-xl font-semibold mb-3">Getting started</h2>
          <div className="rounded-xl border bg-card p-4 text-sm space-y-2 text-foreground/90">
            <p>
              Prism Chess lets you play chess variants — built-in ones we curate, and games you design yourself in the Sandbox.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>The first time you open a game, a tutorial pops up explaining its pieces and rules.</li>
              <li>Tap any piece during a game to see legal moves. The <strong>Info</strong> toggle in the game's top bar shows per-piece tips.</li>
              <li>Open <strong>Sandbox</strong> to design your own variant. Add a description and we'll generate a tutorial for it automatically.</li>
              <li>You can replay any tutorial here at any time.</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold mb-3">Built-in games</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {builtins.map(({ g }) => (
              <div key={g.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display font-semibold">{g.name}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {g.rows}×{g.cols}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{g.description}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => viewBuiltin(g)}>
                    <BookOpen className="h-3 w-3 mr-1" /> Tutorial
                  </Button>
                  <Button size="sm" onClick={() => playBuiltin(g)}>
                    <Play className="h-3 w-3 mr-1" /> Play
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold mb-3">Your saved games</h2>
          {saved.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card/40 p-6 text-center text-sm text-muted-foreground">
              No saved games yet. Design one in the Sandbox and we'll create a tutorial for it.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {saved.map((g) => (
                <div key={g.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-display font-semibold truncate">{g.name}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {g.design.rows}×{g.design.cols}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {g.description || "No description provided."}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => viewSaved(g)}>
                      <BookOpen className="h-3 w-3 mr-1" /> Tutorial
                    </Button>
                    <Button size="sm" onClick={() => playSaved(g)}>
                      <Play className="h-3 w-3 mr-1" /> Play
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {open && (
        <TutorialDialog
          gameId={open.gameId}
          gameName={open.gameName}
          tutorial={open.tutorial}
          open={true}
          onOpenChange={(o) => { if (!o) setOpen(null); }}
        />
      )}
    </div>
  );
}
