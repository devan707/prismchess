import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppShell } from "@/components/shell/AppShell";
import { BUILTIN_GAMES, loadSavedGames, tutorialForBuiltin, tutorialForSaved, type GameType, type SavedGame } from "@/game/library";
import { saveCurrentMeta, saveDesign } from "@/game/design";
import { Swords, Bot, Users, Trophy, Play, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/lobby")({
  head: () => ({
    meta: [
      { title: "New Game — Prism Chess" },
      { name: "description", content: "Start a multiplayer match, challenge a friend, or play a variant against the AI." },
    ],
  }),
  component: Lobby,
});

function Lobby() {
  const navigate = useNavigate();
  const [pickAi, setPickAi] = useState(false);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  useEffect(() => { setSaved(loadSavedGames()); }, []);

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
    <AppShell>
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold px-1">New Game</h1>

        {!pickAi ? (
          <>
            <Link to="/multiplayer" className="block">
              <Button size="lg" className="w-full h-16 text-base font-bold justify-between">
                <span className="inline-flex items-center gap-3">
                  <Swords className="h-6 w-6" /> Play Online
                </span>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </Link>

            <Card>
              <button
                onClick={() => setPickAi(true)}
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition text-left"
              >
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Play vs AI</div>
                  <div className="text-xs text-muted-foreground">Pick any variant and play offline</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
              <div className="border-t" />
              <Link to="/multiplayer" className="flex items-center gap-3 p-4 hover:bg-muted/50 transition">
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Play a Friend</div>
                  <div className="text-xs text-muted-foreground">Create or join a challenge</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </Link>
              <div className="border-t" />
              <div className="flex items-center gap-3 p-4 opacity-50 cursor-not-allowed">
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-muted-foreground">
                  <Trophy className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Tournaments</div>
                  <div className="text-xs text-muted-foreground">Coming soon</div>
                </div>
              </div>
            </Card>
          </>
        ) : (
          <>
            <button onClick={() => setPickAi(false)} className="text-sm text-primary font-medium px-1">
              ← Back
            </button>
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Built-in</h2>
            <Card className="divide-y">
              {BUILTIN_GAMES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => playBuiltin(g)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {g.name}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">{g.rows}×{g.cols}</span>
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{g.description}</div>
                  </div>
                  <Play className="h-4 w-4 text-primary" />
                </button>
              ))}
            </Card>

            {saved.length > 0 && (
              <>
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 mt-4">Your saved variants</h2>
                <Card className="divide-y">
                  {saved.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => playSaved(g)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-2">
                          {g.name}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">{g.design.rows}×{g.design.cols}</span>
                        </div>
                      </div>
                      <Play className="h-4 w-4 text-primary" />
                    </button>
                  ))}
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
