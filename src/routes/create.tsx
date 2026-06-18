import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppShell } from "@/components/shell/AppShell";
import { loadSavedGames, deleteSavedGame, tutorialForSaved, type SavedGame } from "@/game/library";
import { saveCurrentMeta, saveDesign } from "@/game/design";
import { Hammer, Sparkles, Play, Trash2, Crown } from "lucide-react";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create — Prism Chess" },
      { name: "description", content: "Design your own chess variants and custom pieces." },
    ],
  }),
  component: Create,
});

function Create() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState<SavedGame[]>([]);
  useEffect(() => { setSaved(loadSavedGames()); }, []);

  const playSaved = (g: SavedGame) => {
    saveDesign(g.design);
    saveCurrentMeta({ id: `saved:${g.id}`, name: g.name, description: g.description, tutorial: tutorialForSaved(g) });
    navigate({ to: "/play" });
  };
  const removeSaved = (id: string) => {
    deleteSavedGame(id);
    setSaved(loadSavedGames());
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold px-1">Create</h1>

        <div className="grid grid-cols-2 gap-3">
          <Link to="/sandbox">
            <Card className="p-4 h-32 flex flex-col items-center justify-center gap-2 hover:border-primary transition text-center">
              <Hammer className="h-8 w-8 text-primary" />
              <div className="font-semibold text-sm">Design a Game</div>
              <div className="text-[10px] text-muted-foreground">Board + pieces</div>
            </Card>
          </Link>
          <Link to="/pieces/new">
            <Card className="p-4 h-32 flex flex-col items-center justify-center gap-2 hover:border-primary transition text-center">
              <Crown className="h-8 w-8 text-primary" />
              <div className="font-semibold text-sm">Design a Piece</div>
              <div className="text-[10px] text-muted-foreground">Movement + icon</div>
            </Card>
          </Link>
        </div>

        <section className="space-y-2">
          <div className="flex items-end justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your drafts</h2>
            <Link to="/sandbox">
              <Button size="sm" variant="ghost" className="text-primary">
                <Sparkles className="h-4 w-4 mr-1" /> New
              </Button>
            </Link>
          </div>
          {saved.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
              No drafts yet. Tap <span className="font-medium text-foreground">Design a Game</span> to start.
            </Card>
          ) : (
            <Card className="divide-y">
              {saved.map((g) => (
                <div key={g.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{g.name}</div>
                    <div className="text-xs text-muted-foreground">{g.design.rows}×{g.design.cols} · saved {new Date(g.createdAt).toLocaleDateString()}</div>
                  </div>
                  <Button size="sm" onClick={() => playSaved(g)}>
                    <Play className="h-3 w-3 mr-1" /> Play
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeSaved(g.id)} aria-label="Delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}
