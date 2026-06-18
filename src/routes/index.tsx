import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BUILTIN_GAMES,
  deleteSavedGame,
  loadSavedGames,
  tutorialForBuiltin,
  tutorialForSaved,
  type GameType,
  type SavedGame,
} from "@/game/library";
import { saveCurrentMeta, saveDesign } from "@/game/design";
import { getVariantStats, type VariantStats } from "@/lib/variant-stats.functions";
import { listDiscoveryGames } from "@/lib/social.functions";
import { PlayCount } from "@/components/chess/PlayCount";
import { Hammer, Play, Trash2, Sparkles, MessagesSquare, Swords, History, BookOpen, Users, Mail, Heart, MessageSquare, Flame, Clock, Archive } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prism Chess — Design your own variant" },
      { name: "description", content: "Prism Chess: pick a built-in variant or design your own boards and pieces, play vs AI, and discuss strategy." },
      { property: "og:title", content: "Prism Chess" },
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
  const [stats, setStats] = useState<Record<string, VariantStats>>({});
  type DiscoveryRes = Awaited<ReturnType<typeof listDiscoveryGames>>;
  type DiscoveryGame = DiscoveryRes["newest"][number];
  const [discovery, setDiscovery] = useState<DiscoveryRes | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => { setSaved(loadSavedGames()); }, []);

  useEffect(() => {
    let cancelled = false;
    listDiscoveryGames()
      .then((d) => { if (!cancelled) setDiscovery(d); })
      .catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, []);

  const variantKeys = useMemo(() => [
    ...BUILTIN_GAMES.map((g) => `builtin:${g.id}`),
    ...saved.map((g) => `saved:${g.id}`),
  ], [saved]);

  useEffect(() => {
    if (variantKeys.length === 0) return;
    let cancelled = false;
    getVariantStats({ data: { variantKeys } })
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => { /* counters are best-effort */ });
    return () => { cancelled = true; };
  }, [variantKeys]);

  const playBuiltin = (g: GameType) => {
    const design = g.build();
    saveDesign(design);
    saveCurrentMeta({
      id: `builtin:${g.id}`,
      name: g.name,
      description: g.description,
      tutorial: tutorialForBuiltin(g),
    });
    navigate({ to: "/play" });
  };

  const playSaved = (g: SavedGame) => {
    saveDesign(g.design);
    saveCurrentMeta({
      id: `saved:${g.id}`,
      name: g.name,
      description: g.description,
      tutorial: tutorialForSaved(g),
    });
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
        <img src={logoUrl} alt="Prism Chess crest" width={128} height={128} className="mx-auto h-28 w-28 mb-2" />
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
          Prism <span className="text-primary">Chess</span>
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
          Design your own variant. Rule the board. Pick a game to play, build your own, or join the community.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <Link to="/multiplayer">
            <Button size="lg">
              <Swords className="h-4 w-4 mr-2" /> Multiplayer
            </Button>
          </Link>
          <Link to="/sandbox">
            <Button size="lg" variant="outline">
              <Hammer className="h-4 w-4 mr-2" /> Sandbox mode
            </Button>
          </Link>
          <Link to="/friends">
            <Button size="lg" variant="outline">
              <Users className="h-4 w-4 mr-2" /> Friends
            </Button>
          </Link>
          <Link to="/messages">
            <Button size="lg" variant="outline">
              <Mail className="h-4 w-4 mr-2" /> Messages
            </Button>
          </Link>
          <Link to="/forum">
            <Button size="lg" variant="outline">
              <MessagesSquare className="h-4 w-4 mr-2" /> Community
            </Button>
          </Link>
          <Link to="/history">
            <Button size="lg" variant="outline">
              <History className="h-4 w-4 mr-2" /> History
            </Button>
          </Link>
          <Link to="/help">
            <Button size="lg" variant="outline">
              <BookOpen className="h-4 w-4 mr-2" /> Help
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-16 space-y-10">
        <section>
          <h2 className="font-display text-xl font-semibold mb-3">Built-in games</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BUILTIN_GAMES.map((g) => {
              const s = stats[`builtin:${g.id}`];
              return (
                <button
                  key={g.id}
                  onClick={() => playBuiltin(g)}
                  className="relative group text-left rounded-xl border bg-card p-4 pb-7 hover:border-primary hover:shadow-md transition"
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
                  {s && <PlayCount unique={s.unique} total={s.total} className="absolute bottom-2 right-3" />}
                </button>
              );
            })}
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
              {saved.map((g) => {
                const s = stats[`saved:${g.id}`];
                return (
                  <div key={g.id} className="relative rounded-xl border bg-card p-4 pb-7 flex flex-col">
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
                      <Button size="sm" className="flex-1" onClick={() => playSaved(g)}>
                        <Play className="h-3 w-3 mr-1" /> Play
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeSaved(g.id)} aria-label="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {s && <PlayCount unique={s.unique} total={s.total} className="absolute bottom-2 right-3" />}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
