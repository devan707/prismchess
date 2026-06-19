import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BUILTIN_GAMES,
  loadSavedGames,
  tutorialForBuiltin,
  type GameType,
  type SavedGame,
} from "@/game/library";
import { saveCurrentMeta, saveDesign } from "@/game/design";
import { listDiscoveryGames } from "@/lib/social.functions";
import { listMyMatches } from "@/lib/multiplayer.functions";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui/card";
import { Play, Heart, MessageSquare, ChevronRight, Swords, Hammer } from "lucide-react";
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

interface LastVariant {
  id: string;
  name: string;
  description?: string;
}

function signatureGlyphs(id: string): [string, string, string] {
  switch (id) {
    case "classic-8": return ["♞", "♛", "♝"];
    case "mini-6": return ["♜", "♚", "♛"];
    case "menagerie-8": return ["🏹", "🧙", "🐉"];
    case "grand-menagerie-12": return ["👑", "☠️", "🔺"];
    default: return ["♟", "♚", "♟"];
  }
}

function readLastVariant(): LastVariant | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("designer:currentMeta");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && typeof parsed.name === "string") {
      return { id: parsed.id, name: parsed.name, description: parsed.description };
    }
  } catch { /* noop */ }
  return null;
}

function pickFeatured(): GameType {
  // Always feature Grand Menagerie on the main menu.
  return BUILTIN_GAMES.find((g) => g.id === "grand-menagerie-12") ?? BUILTIN_GAMES[0];
}

function Home() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState<SavedGame[]>([]);
  type DiscoveryRes = Awaited<ReturnType<typeof listDiscoveryGames>>;
  type DiscoveryGame = DiscoveryRes["newest"][number];
  const [discovery, setDiscovery] = useState<DiscoveryRes | null>(null);
  type Match = Awaited<ReturnType<typeof listMyMatches>>[number];
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [lastVariant, setLastVariant] = useState<LastVariant | null>(null);

  useEffect(() => {
    setSaved(loadSavedGames());
    setLastVariant(readLastVariant());
  }, []);

  useEffect(() => {
    let cancelled = false;
    listDiscoveryGames()
      .then((d) => { if (!cancelled) setDiscovery(d); })
      .catch(() => { /* best-effort */ });
    listMyMatches()
      .then((ms) => {
        if (cancelled) return;
        const ongoing = ms.find((m) => m.status === "active" || m.status === "pending");
        setActiveMatch(ongoing ?? null);
      })
      .catch(() => { /* signed-out: ignore */ });
    return () => { cancelled = true; };
  }, []);

  const featured = useMemo(() => pickFeatured(), []);

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

  const continueLast = () => {
    if (!lastVariant) return;
    navigate({ to: "/play" });
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

  return (
    <AppShell showPlayCta>
      <div className="space-y-6">
        {/* RESUME */}
        {(activeMatch || lastVariant) && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Resume</h2>
            {activeMatch && (
              <Link to="/multiplayer/$matchId" params={{ matchId: activeMatch.id }} className="block">
                <Card className="p-4 flex items-center gap-3 hover:border-primary transition">
                  <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                    <Swords className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">Active multiplayer match</div>
                    <div className="text-xs text-muted-foreground">Tap to return to the board</div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Card>
              </Link>
            )}
            {lastVariant && (
              <button onClick={continueLast} className="block w-full text-left">
                <Card className="p-4 flex items-center gap-3 hover:border-primary transition">
                  <div className="h-12 w-12 rounded-md bg-secondary flex items-center justify-center">
                    <img src={logoUrl} alt="" className="h-8 w-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">Continue {lastVariant.name}</div>
                    <div className="text-xs text-muted-foreground truncate">Pick up your last game</div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Card>
              </button>
            )}
          </section>
        )}

        {/* QUICK PLAY (featured) */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground/70 px-1">Featured variant</h2>
          <Card className="p-4 rounded-sm">
            <div className="flex items-start gap-3">
              <div className="h-14 w-14 rounded-sm bg-gradient-to-br from-[#ff4d6d]/40 via-[#ffe24d]/30 to-[#4dc4ff]/40 flex items-center justify-center text-card-foreground shrink-0 font-display font-black text-2xl">
                {featured.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-base">{featured.name}</div>
                <p className="text-xs text-card-foreground/70 line-clamp-2 mt-0.5">{featured.description}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Link to="/v/$id" params={{ id: featured.id }} className="flex-1">
                <button className="prism-border prism-border-hover w-full inline-flex items-center justify-center h-10 text-sm font-semibold tracking-wide">
                  View
                </button>
              </Link>
              <button
                onClick={() => playBuiltin(featured)}
                className="rounded-sm h-10 px-3 inline-flex items-center justify-center text-sm font-semibold border border-input bg-background hover:bg-accent"
              >
                <Play className="h-4 w-4 mr-1" /> Play
              </button>
              <Link to="/lobby" className="flex-shrink-0">
                <Button variant="outline" className="rounded-sm h-10">More</Button>
              </Link>
            </div>
          </Card>
        </section>


        {/* SIGNATURE GAMES (built-in) */}
        <section className="space-y-2">
          <div className="flex items-end justify-between px-1">
            <h2 className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-foreground/80">Signature Games</h2>
            <Link to="/lobby" className="text-xs font-semibold text-primary inline-flex items-center gap-0.5">
              All <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="-mx-3 sm:-mx-4 px-3 sm:px-4 overflow-x-auto">
            <div className="flex gap-3 pb-2 snap-x">
              {BUILTIN_GAMES.map((g) => {
                const glyphs = signatureGlyphs(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => playBuiltin(g)}
                    className="w-44 shrink-0 snap-start text-left"
                  >
                    <Card className="p-3 h-full flex flex-col rounded-sm bg-card border-foreground/10 hover:border-foreground/30 transition overflow-hidden">
                      <div className="prism-tile h-24 -mx-3 -mt-3 mb-2 flex items-center justify-center gap-1">
                        <span className="relative z-10 flex items-end gap-1 text-card-foreground/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                          <span className="text-3xl opacity-80">{glyphs[0]}</span>
                          <span className="text-5xl">{glyphs[1]}</span>
                          <span className="text-3xl opacity-80">{glyphs[2]}</span>
                        </span>
                      </div>
                      <div className="font-display font-bold text-sm tracking-wide uppercase truncate">{g.name}</div>
                      <p className="text-[11px] text-card-foreground/70 line-clamp-2 mt-0.5 flex-1">{g.description}</p>
                      <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold">
                        <Play className="h-3 w-3" /> Play
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* NEW FROM COMMUNITY */}

        <section className="space-y-2">
          <div className="flex items-end justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New from the community</h2>
            <Link to="/discover" className="text-xs font-semibold text-primary inline-flex items-center gap-0.5">
              See all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {!discovery ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
          ) : discovery.newest.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No public games yet. <Link to="/create" className="text-primary font-medium">Design one →</Link>
            </Card>
          ) : (
            <div className="-mx-3 sm:-mx-4 px-3 sm:px-4 overflow-x-auto">
              <div className="flex gap-3 pb-2 snap-x">
                {discovery.newest.slice(0, 10).map((g) => (
                  <Link key={g.id} to="/g/$slug" params={{ slug: g.slug }} className="w-56 shrink-0 snap-start block">
                    <Card className="p-3 h-full flex flex-col hover:border-primary transition">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="font-semibold truncate text-sm">{g.name}</div>
                        {g.rows && g.cols && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                            {g.rows}×{g.cols}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2 min-h-[2lh]">{g.description}</p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
                        <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {g.like_count}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {g.comment_count}</span>
                      </div>
                      <Button size="sm" className="w-full" onClick={(e) => { e.preventDefault(); e.stopPropagation(); playPublished(g); }}>
                        <Play className="h-3 w-3 mr-1" /> Play
                      </Button>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* POPULAR */}
        {discovery && discovery.popular.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-end justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Popular</h2>
              <Link to="/discover" className="text-xs font-semibold text-primary inline-flex items-center gap-0.5">
                See all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="-mx-3 sm:-mx-4 px-3 sm:px-4 overflow-x-auto">
              <div className="flex gap-3 pb-2 snap-x">
                {discovery.popular.slice(0, 10).map((g) => (
                  <Link key={g.id} to="/g/$slug" params={{ slug: g.slug }} className="w-56 shrink-0 snap-start block">
                    <Card className="p-3 h-full flex flex-col hover:border-primary transition">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="font-semibold truncate text-sm">{g.name}</div>
                        {g.rows && g.cols && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                            {g.rows}×{g.cols}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2 min-h-[2lh]">{g.description}</p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
                        <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {g.like_count}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {g.comment_count}</span>
                      </div>
                      <Button size="sm" className="w-full" onClick={(e) => { e.preventDefault(); e.stopPropagation(); playPublished(g); }}>
                        <Play className="h-3 w-3 mr-1" /> Play
                      </Button>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* YOUR DRAFTS preview */}
        {saved.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-end justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your drafts</h2>
              <Link to="/create" className="text-xs font-semibold text-primary inline-flex items-center gap-0.5">
                Manage <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <Card className="divide-y">
              {saved.slice(0, 3).map((g) => (
                <Link
                  key={g.id}
                  to="/create"
                  className="flex items-center gap-3 p-3 hover:bg-muted/50 transition"
                >
                  <div className="h-10 w-10 rounded bg-secondary flex items-center justify-center">
                    <Hammer className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{g.name}</div>
                    <div className="text-xs text-muted-foreground">{g.design.rows}×{g.design.cols}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </Card>
          </section>
        )}
      </div>
    </AppShell>
  );
}
