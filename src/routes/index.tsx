import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BUILTIN_GAMES, deleteSavedGame, loadSavedGames, type SavedGame } from "@/game/library";
import { saveDesign } from "@/game/design";
import type { Design } from "@/game/types";
import { Hammer, Play, Trash2, Sparkles, MessagesSquare } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kingdom Chess — Design your own variant" },
      { name: "description", content: "Kingdom Chess: pick a built-in variant or design your own boards and pieces, play vs AI, and discuss strategy." },
      { property: "og:title", content: "Kingdom Chess" },
      { property: "og:description", content: "Design your own chess variant. Rule the board." },
      { property: "og:image", content: "/og-banner.jpg" },
      { property: "og:url", content: "https://mini-chess-buddy.lovable.app/" },
      { name: "twitter:image", content: "/og-banner.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://mini-chess-buddy.lovable.app/" }],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState<SavedGame[]>([]);

  useEffect(() => { setSaved(loadSavedGames()); }, []);

  const play = (design: Design) => {
    saveDesign(design);
    navigate({ to: "/play" });
  };

  const removeSaved = (id: string) => {
    deleteSavedGame(id);
    setSaved(loadSavedGames());
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 pt-4 flex justify-end">
        <UserMenu />
      </div>
      <header className="max-w-5xl mx-auto px-4 pt-2 pb-6 text-center">
        <img src={logoUrl} alt="Kingdom Chess crest" width={128} height={128} className="mx-auto h-28 w-28 mb-2" />
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
          Kingdom <span className="text-primary">Chess</span>
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
          Design your own variant. Rule the board. Pick a game to play, build your own, or join the community.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <Link to="/sandbox">
            <Button size="lg" variant="outline">
              <Hammer className="h-4 w-4 mr-2" /> Sandbox mode
            </Button>
          </Link>
          <Link to="/forum">
            <Button size="lg" variant="outline">
              <MessagesSquare className="h-4 w-4 mr-2" /> Community
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-16 space-y-10">
        <section>
          <h2 className="font-display text-xl font-semibold mb-3">Built-in games</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BUILTIN_GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => play(g.build())}
                className="group text-left rounded-xl border bg-card p-4 hover:border-primary hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display font-semibold">{g.name}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {g.rows}×{g.cols}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{g.description}</p>
                <span className="inline-flex items-center text-xs font-medium text-primary group-hover:gap-2 gap-1 transition-all">
                  <Play className="h-3 w-3" /> Play
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl font-semibold">Your saved games</h2>
            <Link to="/sandbox">
              <Button size="sm" variant="ghost">
                <Sparkles className="h-4 w-4 mr-1" /> Design a new one
              </Button>
            </Link>
          </div>
          {saved.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card/40 p-8 text-center text-sm text-muted-foreground">
              No saved games yet. Head into the sandbox to design one and save it.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((g) => (
                <div key={g.id} className="rounded-xl border bg-card p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-display font-semibold truncate">{g.name}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {g.design.rows}×{g.design.cols}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Saved {new Date(g.createdAt).toLocaleDateString()}
                  </p>
                  <div className="mt-auto flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => play(g.design)}>
                      <Play className="h-3 w-3 mr-1" /> Play
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeSaved(g.id)} aria-label="Delete">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
