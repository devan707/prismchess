import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppShell } from "@/components/shell/AppShell";
import { listDiscoveryGames } from "@/lib/social.functions";
import { adminSetPublishedGameFlags, adminDeletePublishedGame } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";
import { AdminMenu } from "@/components/admin/AdminMenu";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Play, Heart, MessageSquare, Crown, MessagesSquare, Hammer } from "lucide-react";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "Discover — Prism Chess" },
      { name: "description", content: "Browse community variants, custom pieces, and forum discussions." },
    ],
  }),
  component: Discover,
});

function Discover() {
  const navigate = useNavigate();
  type DiscoveryRes = Awaited<ReturnType<typeof listDiscoveryGames>>;
  type DiscoveryGame = DiscoveryRes["newest"][number];
  const [discovery, setDiscovery] = useState<DiscoveryRes | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const { isModOrAdmin } = useIsAdmin();
  const setFlags = useServerFn(adminSetPublishedGameFlags);
  const del = useServerFn(adminDeletePublishedGame);
  const reload = () => listDiscoveryGames().then(setDiscovery).catch(() => {});

  useEffect(() => {
    let cancelled = false;
    listDiscoveryGames().then((d) => { if (!cancelled) setDiscovery(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const playPublished = async (g: DiscoveryGame) => {
    const { getPublishedGame } = await import("@/lib/social.functions");
    const res = await getPublishedGame({ data: { slug: g.slug } });
    if (!res) return;
    const { saveDesign, saveCurrentMeta } = await import("@/game/design");
    saveDesign(res.game.design as never);
    saveCurrentMeta({
      id: `published:${res.game.id}`,
      name: res.game.name,
      description: res.game.description,
      tutorial: (res.game.tutorial as never) ?? undefined,
    });
    navigate({ to: "/play" });
  };

  const renderCard = (g: DiscoveryGame) => (
    <Card key={g.id} className="p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-display font-semibold truncate">{g.name}</h3>
        {g.rows && g.cols && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
            {g.rows}×{g.cols}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-1 truncate">
        by{" "}
        {g.author ? (
          <Link to="/u/$username" params={{ username: g.author.username }} className="hover:underline">
            {g.author.display_name ?? g.author.username}
          </Link>
        ) : "unknown"}
      </p>
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2 min-h-[2lh]">{g.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {g.like_count}</span>
          <Link to="/g/$slug" params={{ slug: g.slug }} className="inline-flex items-center gap-1 hover:text-foreground">
            <MessageSquare className="h-3 w-3" /> {g.comment_count}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <AdminMenu
            show={isModOrAdmin}
            actions={[
              { label: "Hide from feeds", onClick: async () => { await setFlags({ data: { gameId: g.id, isHidden: true } }); reload(); } },
              { label: "Feature", onClick: async () => { await setFlags({ data: { gameId: g.id, isFeatured: true } }); reload(); } },
              { label: "Delete permanently", destructive: true, confirm: `Delete "${g.name}"? This cannot be undone.`, onClick: async () => { await del({ data: { gameId: g.id } }); reload(); } },
            ]}
          />
          <Button size="sm" onClick={() => playPublished(g)}>
            <Play className="h-3 w-3 mr-1" /> Play
          </Button>
        </div>
      </div>
    </Card>
  );

  return (
    <AppShell showPlayCta>
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-bold px-1">Discover</h1>

        <Tabs defaultValue="games">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="games">Games</TabsTrigger>
            <TabsTrigger value="pieces">Pieces</TabsTrigger>
            <TabsTrigger value="forum">Forum</TabsTrigger>
          </TabsList>

          <TabsContent value="games" className="space-y-6 mt-4">
            {!discovery ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">Loading…</Card>
            ) : (
              <>
                <section className="space-y-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">New</h2>
                  {discovery.newest.length === 0 ? (
                    <Card className="p-6 text-center text-sm text-muted-foreground">No public games yet.</Card>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">{discovery.newest.map(renderCard)}</div>
                  )}
                </section>
                {discovery.popular.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Popular</h2>
                    <div className="grid gap-3 sm:grid-cols-2">{discovery.popular.map(renderCard)}</div>
                  </section>
                )}
                {discovery.archive.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-end justify-between px-1">
                      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Archive ({discovery.archive.length})</h2>
                      <Button size="sm" variant="ghost" onClick={() => setShowArchive((v) => !v)}>
                        {showArchive ? "Hide" : "Show"}
                      </Button>
                    </div>
                    {showArchive && <div className="grid gap-3 sm:grid-cols-2">{discovery.archive.map(renderCard)}</div>}
                  </section>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="pieces" className="mt-4">
            <Card className="p-6 text-center space-y-3">
              <Crown className="h-10 w-10 mx-auto text-primary" />
              <div className="font-semibold">Custom piece library</div>
              <p className="text-sm text-muted-foreground">Browse community-designed pieces — new, popular, and the full archive.</p>
              <Link to="/pieces"><Button>Open piece library</Button></Link>
            </Card>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link to="/pieces/new">
                <Card className="p-4 flex flex-col items-center gap-2 hover:border-primary transition text-center">
                  <Hammer className="h-6 w-6 text-primary" />
                  <div className="text-sm font-semibold">Design your own</div>
                </Card>
              </Link>
              <Link to="/pieces">
                <Card className="p-4 flex flex-col items-center gap-2 hover:border-primary transition text-center">
                  <Crown className="h-6 w-6 text-primary" />
                  <div className="text-sm font-semibold">Browse all</div>
                </Card>
              </Link>
            </div>
          </TabsContent>

          <TabsContent value="forum" className="mt-4">
            <Card className="p-6 text-center space-y-3">
              <MessagesSquare className="h-10 w-10 mx-auto text-primary" />
              <div className="font-semibold">Community forum</div>
              <p className="text-sm text-muted-foreground">Discuss strategy, share variants, request features.</p>
              <Link to="/forum"><Button>Open forum</Button></Link>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
