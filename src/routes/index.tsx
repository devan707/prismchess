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
import {
  Hammer, Play, Trash2, Sparkles, MessagesSquare, Swords, History,
  BookOpen, Users, Mail, Heart, MessageSquare, Flame, Clock, Archive, ChevronRight,
} from "lucide-react";
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

  const playPublished = async (g: DiscoveryGame) => {
    const { getPublishedGame } = await import("@/lib/social.functions");
    const res = await getPublishedGame({ data: { slug: g.slug } });
    if (!res) return;
    const { saveDesign: sd, saveCurrentMeta: scm } = await import("@/game/design");
    sd(res.game.design as never);
    scm({
      id: `published:${res.game.id}`,
      name: res.game.name,
      description: res.game.description,
      tutorial: (res.game.tutorial as never) ?? undefined,
    });
    navigate({ to: "/play" });
  };

  const SectionHeader = ({ icon, title, meta, action }: { icon?: React.ReactNode; title: string; meta?: React.ReactNode; action?: React.ReactNode }) => (
    <div className="flex items-end justify-between mb-4">
      <h2 className="home-accent-bar font-display text-xl sm:text-2xl font-bold text-foreground inline-flex items-center gap-2">
        {icon}{title}
      </h2>
      <div className="flex items-center gap-3">
        {meta && <span className="text-[10px] font-bold tracking-widest uppercase text-[#c9a84c]/70">{meta}</span>}
        {action}
      </div>
    </div>
  );

  const renderCommunityCard = (g: DiscoveryGame) => (
    <div key={g.id} className="relative home-panel p-4 pb-3 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-display font-semibold truncate text-foreground">{g.name}</h3>
        {g.rows && g.cols && (
          <span className="text-[10px] px-1.5 py-0.5 bg-[#c9a84c]/15 text-[#e8d28c] shrink-0 font-black">
            {g.rows}×{g.cols}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-1 truncate">
        by{" "}
        {g.author ? (
          <Link to="/u/$username" params={{ username: g.author.username }} className="hover:underline text-[#c9a84c]">
            {g.author.display_name ?? g.author.username}
          </Link>
        ) : "unknown"}
      </p>
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{g.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1" title="Likes">
            <Heart className="h-3 w-3" /> {g.like_count}
          </span>
          <Link
            to="/g/$slug"
            params={{ slug: g.slug }}
            className="inline-flex items-center gap-1 hover:text-foreground"
            title="View comments"
          >
            <MessageSquare className="h-3 w-3" /> {g.comment_count}
          </Link>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/g/$slug" params={{ slug: g.slug }}>
            <Button size="sm" variant="ghost" className="rounded-none text-foreground/80 hover:text-foreground">Details</Button>
          </Link>
          <Button size="sm" onClick={() => playPublished(g)} className="rounded-none bg-[#c9a84c] text-[#0a0d14] hover:bg-[#d9b85c]">
            <Play className="h-3 w-3 mr-1" /> Play
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen text-foreground dark">
      {/* Misty rainbow backdrop */}
      <div aria-hidden className="home-aurora-bg fixed inset-0 -z-20" />
      <div aria-hidden className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,7,12,0.55)_70%,rgba(5,7,12,0.85)_100%)]" />

      <h1 className="sr-only">Prism Chess — Design your own variant</h1>

      <div className="max-w-5xl mx-auto px-4 pt-4 flex justify-end">
        <UserMenu />
      </div>

      <header className="max-w-5xl mx-auto px-4 pt-2 pb-8 text-center">
        <img
          src={logoUrl}
          alt="Prism Chess"
          width={320}
          height={320}
          className="mx-auto h-44 w-44 sm:h-56 sm:w-56 drop-shadow-[0_8px_30px_rgba(201,168,76,0.25)]"
        />
        <p className="mt-3 text-[11px] sm:text-xs uppercase tracking-[0.25em] text-[#c9a84c]/80 font-medium">
          The Ultimate Variant Sandbox
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-16 space-y-10">
        {/* Primary actions */}
        <section className="space-y-3">
          <Link to="/multiplayer" className="block">
            <button className="w-full flex items-center justify-center gap-3 bg-[#c9a84c] text-[#0a0d14] py-4 font-semibold shadow-[0_8px_30px_rgba(201,168,76,0.25)] hover:bg-[#d9b85c] active:scale-[0.99] transition">
              <Swords className="h-5 w-5" /> Play Multiplayer
            </button>
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/sandbox">
              <button className="w-full home-panel-strong flex flex-col items-center justify-center gap-2 py-5 text-xs font-bold tracking-wider text-foreground hover:border-[#c9a84c]/60 transition">
                <Hammer className="h-6 w-6 text-[#c9a84c]" />
                SANDBOX
              </button>
            </Link>
            <Link to="/forum">
              <button className="w-full home-panel-strong flex flex-col items-center justify-center gap-2 py-5 text-xs font-bold tracking-wider text-foreground hover:border-[#c9a84c]/60 transition">
                <MessagesSquare className="h-6 w-6 text-[#c9a84c]" />
                COMMUNITY
              </button>
            </Link>
          </div>
          {/* Secondary utility row */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            {[
              { to: "/friends", icon: Users, label: "Friends" },
              { to: "/messages", icon: Mail, label: "Messages" },
              { to: "/history", icon: History, label: "History" },
              { to: "/help", icon: BookOpen, label: "Help" },
            ].map(({ to, icon: Icon, label }) => (
              <Link key={to} to={to} className="home-panel flex flex-col items-center justify-center py-3 gap-1 hover:border-[#c9a84c]/40 transition">
                <Icon className="h-4 w-4 text-[#c9a84c]/90" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Built-in games */}
        <section>
          <SectionHeader title="Built-in games" meta={`${BUILTIN_GAMES.length} variants`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BUILTIN_GAMES.map((g) => {
              const s = stats[`builtin:${g.id}`];
              return (
                <button
                  key={g.id}
                  onClick={() => playBuiltin(g)}
                  className="relative group text-left home-panel p-4 pb-7 hover:border-[#c9a84c]/50 hover:bg-[rgba(20,26,38,0.85)] transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-display font-semibold text-foreground">{g.name}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#c9a84c]/15 text-[#e8d28c] font-black">
                      {g.rows}×{g.cols}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-3">{g.description}</p>
                  <span className="inline-flex items-center text-[11px] font-black text-[#c9a84c] uppercase tracking-wider group-hover:gap-2 gap-1 transition-all">
                    Play <ChevronRight className="h-3 w-3" />
                  </span>
                  {s && <PlayCount unique={s.unique} total={s.total} className="absolute bottom-2 right-3" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Saved games */}
        <section>
          <SectionHeader
            title="Your saved games"
            action={
              <Link to="/sandbox">
                <Button size="sm" variant="ghost" className="rounded-none text-[#c9a84c] hover:text-[#d9b85c]">
                  <Sparkles className="h-4 w-4 mr-1" /> Design new
                </Button>
              </Link>
            }
          />
          {saved.length === 0 ? (
            <div className="border border-dashed border-[#c9a84c]/25 bg-[rgba(14,18,26,0.5)] p-8 text-center text-sm text-muted-foreground">
              No saved games yet. Head into the sandbox to design one and save it.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((g) => {
                const s = stats[`saved:${g.id}`];
                return (
                  <div key={g.id} className="relative home-panel p-4 pb-7 flex flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-display font-semibold truncate text-foreground">{g.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 bg-[#c9a84c]/15 text-[#e8d28c] font-black">
                        {g.design.rows}×{g.design.cols}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Saved {new Date(g.createdAt).toLocaleDateString()}
                    </p>
                    <div className="mt-auto flex gap-2">
                      <Button size="sm" className="flex-1 rounded-none bg-[#c9a84c] text-[#0a0d14] hover:bg-[#d9b85c]" onClick={() => playSaved(g)}>
                        <Play className="h-3 w-3 mr-1" /> Play
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-none text-muted-foreground hover:text-destructive" onClick={() => removeSaved(g.id)} aria-label="Delete">
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

        {/* New from community */}
        <section>
          <SectionHeader
            icon={<Clock className="h-5 w-5 text-[#c9a84c]" />}
            title="New from the community"
            action={
              <Link to="/sandbox">
                <Button size="sm" variant="ghost" className="rounded-none text-[#c9a84c] hover:text-[#d9b85c]">
                  <Sparkles className="h-4 w-4 mr-1" /> Publish your own
                </Button>
              </Link>
            }
          />
          {!discovery ? (
            <div className="border border-dashed border-[#c9a84c]/25 bg-[rgba(14,18,26,0.5)] p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : discovery.newest.length === 0 ? (
            <div className="border border-dashed border-[#c9a84c]/25 bg-[rgba(14,18,26,0.5)] p-8 text-center text-sm text-muted-foreground">
              No public games yet. Design one in the sandbox and publish it!
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {discovery.newest.map(renderCommunityCard)}
            </div>
          )}
        </section>

        {discovery && discovery.popular.length > 0 && (
          <section>
            <SectionHeader icon={<Flame className="h-5 w-5 text-[#c9a84c]" />} title="Popular" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {discovery.popular.map(renderCommunityCard)}
            </div>
          </section>
        )}

        {discovery && discovery.archive.length > 0 && (
          <section>
            <SectionHeader
              icon={<Archive className="h-5 w-5 text-[#c9a84c]" />}
              title="Archive"
              meta={`${discovery.archive.length}`}
              action={
                <Button size="sm" variant="ghost" className="rounded-none text-[#c9a84c] hover:text-[#d9b85c]" onClick={() => setShowArchive((v) => !v)}>
                  {showArchive ? "Hide" : "Show"}
                </Button>
              }
            />
            {showArchive && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {discovery.archive.map(renderCommunityCard)}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
