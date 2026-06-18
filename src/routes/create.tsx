import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppShell } from "@/components/shell/AppShell";
import { PieceById } from "@/components/chess/PieceGlyph";
import type { PieceDef } from "@/game/types";
import { loadSavedGames, deleteSavedGame, tutorialForSaved, type SavedGame } from "@/game/library";
import { saveCurrentMeta, saveDesign } from "@/game/design";
import { listMyPublishedGames, unpublishGame, listMyLikedGames, toggleLike } from "@/lib/social.functions";
import { listMyPieces, listMyLikedPieces, deletePiece, unlikePiece } from "@/lib/piece-builder.functions";
import { supabase } from "@/integrations/supabase/client";
import { Hammer, Sparkles, Play, Trash2, Crown, Share2, Heart, MessageSquare, Pencil, ExternalLink, LogIn, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create — Prism Chess" },
      { name: "description", content: "Your custom games, pieces, drafts, and favorites." },
    ],
  }),
  component: Create,
});

type MyGame = Awaited<ReturnType<typeof listMyPublishedGames>>[number];
type LikedGame = Awaited<ReturnType<typeof listMyLikedGames>>[number];
type MyPiece = Awaited<ReturnType<typeof listMyPieces>>[number];
type LikedPiece = Awaited<ReturnType<typeof listMyLikedPieces>>[number];

function Create() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [drafts, setDrafts] = useState<SavedGame[]>([]);
  const [myGames, setMyGames] = useState<MyGame[]>([]);
  const [myPieces, setMyPieces] = useState<MyPiece[]>([]);
  const [likedGames, setLikedGames] = useState<LikedGame[]>([]);
  const [likedPieces, setLikedPieces] = useState<LikedPiece[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMyGames = useServerFn(listMyPublishedGames);
  const fetchMyPieces = useServerFn(listMyPieces);
  const fetchLikedGames = useServerFn(listMyLikedGames);
  const fetchLikedPieces = useServerFn(listMyLikedPieces);
  const unpublishFn = useServerFn(unpublishGame);
  const deletePieceFn = useServerFn(deletePiece);
  const unlikeGameFn = useServerFn(toggleLike);
  const unlikePieceFn = useServerFn(unlikePiece);

  useEffect(() => { setDrafts(loadSavedGames()); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const authed = !!data.user;
      setSignedIn(authed);
      if (!authed) return;
      setLoading(true);
      try {
        const [g, p, lg, lp] = await Promise.all([
          fetchMyGames(),
          fetchMyPieces(),
          fetchLikedGames(),
          fetchLikedPieces(),
        ]);
        if (cancelled) return;
        setMyGames(g);
        setMyPieces(p);
        setLikedGames(lg);
        setLikedPieces(lp);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Couldn't load your creations");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchMyGames, fetchMyPieces, fetchLikedGames, fetchLikedPieces]);

  const playDraft = (g: SavedGame) => {
    saveDesign(g.design);
    saveCurrentMeta({ id: `saved:${g.id}`, name: g.name, description: g.description, tutorial: tutorialForSaved(g) });
    navigate({ to: "/play" });
  };
  const editDraft = (g: SavedGame) => {
    saveDesign(g.design);
    navigate({ to: "/sandbox" });
  };
  const removeDraft = (id: string) => {
    deleteSavedGame(id);
    setDrafts(loadSavedGames());
  };

  const editPublished = (g: MyGame) => {
    navigate({ to: "/sandbox", search: { edit: g.id } as never });
  };
  const handleUnpublish = async (g: MyGame) => {
    if (!confirm(`Unpublish "${g.name}"? It will be removed from the discover feed. Your local draft is unaffected.`)) return;
    try {
      await unpublishFn({ data: { gameId: g.id } });
      setMyGames((prev) => prev.filter((x) => x.id !== g.id));
      toast.success("Unpublished");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't unpublish");
    }
  };

  const handleDeletePiece = async (p: MyPiece) => {
    if (!confirm(`Delete "${p.name}"? Games that already use this piece keep it locally.`)) return;
    try {
      await deletePieceFn({ data: { pieceId: p.id } });
      setMyPieces((prev) => prev.filter((x) => x.id !== p.id));
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  };

  const handleUnlikeGame = async (g: LikedGame) => {
    try {
      await unlikeGameFn({ data: { gameId: g.id } });
      setLikedGames((prev) => prev.filter((x) => x.id !== g.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't unlike");
    }
  };
  const handleUnlikePiece = async (p: LikedPiece) => {
    try {
      await unlikePieceFn({ data: { pieceId: p.id } });
      setLikedPieces((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't unlike");
    }
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

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">My Creations</h2>
          <Tabs defaultValue="games">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="games">Games</TabsTrigger>
              <TabsTrigger value="pieces">Pieces</TabsTrigger>
              <TabsTrigger value="favorites">Favorites</TabsTrigger>
            </TabsList>

            {/* ============ GAMES ============ */}
            <TabsContent value="games" className="space-y-4">
              {/* Drafts (local) */}
              <div className="space-y-2">
                <div className="flex items-end justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Drafts (this device)</h3>
                  <Link to="/sandbox">
                    <Button size="sm" variant="ghost" className="text-primary">
                      <Sparkles className="h-4 w-4 mr-1" /> New
                    </Button>
                  </Link>
                </div>
                {drafts.length === 0 ? (
                  <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
                    No drafts yet. Tap <span className="font-medium text-foreground">Design a Game</span> to start.
                  </Card>
                ) : (
                  <Card className="divide-y">
                    {drafts.map((g) => (
                      <div key={g.id} className="flex items-center gap-2 p-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{g.name}</div>
                          <div className="text-xs text-muted-foreground">{g.design.rows}×{g.design.cols} · saved {new Date(g.createdAt).toLocaleDateString()}</div>
                        </div>
                        <Button size="sm" onClick={() => playDraft(g)}><Play className="h-3 w-3 mr-1" /> Play</Button>
                        <Button size="sm" variant="ghost" onClick={() => editDraft(g)} aria-label="Edit"><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => removeDraft(g.id)} aria-label="Delete"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </Card>
                )}
              </div>

              {/* Published */}
              <div className="space-y-2">
                <div className="flex items-end justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Published</h3>
                  {signedIn && <span className="text-[10px] text-muted-foreground">Shared in Discover</span>}
                </div>
                {signedIn === false ? (
                  <SignInPrompt msg="Sign in to see games you've published." />
                ) : loading ? (
                  <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">Loading…</Card>
                ) : myGames.length === 0 ? (
                  <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
                    Nothing published yet. Open a draft in the Sandbox and hit <span className="font-medium text-foreground">Publish public</span>.
                  </Card>
                ) : (
                  <Card className="divide-y">
                    {myGames.map((g) => (
                      <div key={g.id} className="flex items-center gap-2 p-3">
                        <div className="flex-1 min-w-0">
                          <Link to="/g/$slug" params={{ slug: g.slug }} className="font-medium text-sm truncate hover:underline block">{g.name}</Link>
                          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                            <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {g.like_count}</span>
                            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {g.comment_count}</span>
                            <span>· {new Date(g.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <Link to="/g/$slug" params={{ slug: g.slug }}><Button size="sm" variant="ghost" aria-label="View"><ExternalLink className="h-3 w-3" /></Button></Link>
                        <Button size="sm" variant="ghost" onClick={() => editPublished(g)} aria-label="Edit"><Pencil className="h-3 w-3" /></Button>
                        <Link to="/sandbox" search={{ duplicate: g.id }}><Button size="sm" variant="ghost" aria-label="Duplicate" title="Duplicate as a new variant"><Copy className="h-3 w-3" /></Button></Link>
                        <Button size="sm" variant="ghost" onClick={() => handleUnpublish(g)} aria-label="Unpublish"><Share2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* ============ PIECES ============ */}
            <TabsContent value="pieces" className="space-y-2">
              {signedIn === false ? (
                <SignInPrompt msg="Sign in to see custom pieces you've built." />
              ) : loading ? (
                <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">Loading…</Card>
              ) : myPieces.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
                  No custom pieces yet. Tap <span className="font-medium text-foreground">Design a Piece</span> above.
                </Card>
              ) : (
                <Card className="divide-y">
                  {myPieces.map((p) => {
                    const def: PieceDef = { ...(p.def as unknown as PieceDef), imageUrl: p.image_url ?? (p.def as unknown as PieceDef).imageUrl };
                    return (
                      <div key={p.id} className="flex items-center gap-3 p-3">
                        <div className="w-10 h-10 rounded bg-stone-200 dark:bg-stone-700 flex items-center justify-center flex-shrink-0">
                          <PieceById id={def.id} color="w" def={def} className="text-2xl" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link to="/pieces/$slug" params={{ slug: p.slug }} className="font-medium text-sm truncate hover:underline block">{p.name}</Link>
                          <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                            <span className="capitalize">{p.visibility}</span>
                            <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {p.like_count}</span>
                          </div>
                        </div>
                        <Link to="/pieces/$slug" params={{ slug: p.slug }}><Button size="sm" variant="ghost" aria-label="View"><ExternalLink className="h-3 w-3" /></Button></Link>
                        <Link to="/pieces/$slug/edit" params={{ slug: p.slug }}><Button size="sm" variant="ghost" aria-label="Edit"><Pencil className="h-3 w-3" /></Button></Link>
                        <Link to="/pieces/new" search={{ from: p.slug }}><Button size="sm" variant="ghost" aria-label="Duplicate" title="Duplicate as a new piece"><Copy className="h-3 w-3" /></Button></Link>
                        <Button size="sm" variant="ghost" onClick={() => handleDeletePiece(p)} aria-label="Delete"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    );
                  })}
                </Card>
              )}
            </TabsContent>

            {/* ============ FAVORITES ============ */}
            <TabsContent value="favorites" className="space-y-4">
              {signedIn === false ? (
                <SignInPrompt msg="Sign in to keep track of games and pieces you've liked." />
              ) : (
                <>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Liked games</h3>
                    {loading ? (
                      <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">Loading…</Card>
                    ) : likedGames.length === 0 ? (
                      <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
                        Browse <Link to="/discover" className="underline text-foreground">Discover</Link> and tap the heart on games you love.
                      </Card>
                    ) : (
                      <Card className="divide-y">
                        {likedGames.map((g) => (
                          <div key={g.id} className="flex items-center gap-2 p-3">
                            <div className="flex-1 min-w-0">
                              <Link to="/g/$slug" params={{ slug: g.slug }} className="font-medium text-sm truncate hover:underline block">{g.name}</Link>
                              <div className="text-xs text-muted-foreground">
                                {g.author ? `by ${g.author.display_name ?? g.author.username}` : ""} · <Heart className="inline h-3 w-3" /> {g.like_count}
                              </div>
                            </div>
                            <Link to="/g/$slug" params={{ slug: g.slug }}><Button size="sm" variant="ghost"><ExternalLink className="h-3 w-3" /></Button></Link>
                            <Button size="sm" variant="ghost" onClick={() => handleUnlikeGame(g)} aria-label="Unlike">
                              <Heart className="h-3 w-3 fill-current text-rose-500" />
                            </Button>
                          </div>
                        ))}
                      </Card>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Liked pieces</h3>
                    {loading ? (
                      <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">Loading…</Card>
                    ) : likedPieces.length === 0 ? (
                      <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
                        Browse the <Link to="/pieces" className="underline text-foreground">piece library</Link> and tap the heart on pieces you love.
                      </Card>
                    ) : (
                      <Card className="divide-y">
                        {likedPieces.map((p) => {
                          const def: PieceDef = { ...(p.def as unknown as PieceDef), imageUrl: p.image_url ?? (p.def as unknown as PieceDef).imageUrl };
                          return (
                            <div key={p.id} className="flex items-center gap-3 p-3">
                              <div className="w-10 h-10 rounded bg-stone-200 dark:bg-stone-700 flex items-center justify-center flex-shrink-0">
                                <PieceById id={def.id} color="w" def={def} className="text-2xl" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <Link to="/pieces/$slug" params={{ slug: p.slug }} className="font-medium text-sm truncate hover:underline block">{p.name}</Link>
                                <div className="text-xs text-muted-foreground"><Heart className="inline h-3 w-3" /> {p.like_count}</div>
                              </div>
                              <Link to="/pieces/$slug" params={{ slug: p.slug }}><Button size="sm" variant="ghost"><ExternalLink className="h-3 w-3" /></Button></Link>
                              <Button size="sm" variant="ghost" onClick={() => handleUnlikePiece(p)} aria-label="Unlike">
                                <Heart className="h-3 w-3 fill-current text-rose-500" />
                              </Button>
                            </div>
                          );
                        })}
                      </Card>
                    )}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </AppShell>
  );
}

function SignInPrompt({ msg }: { msg: string }) {
  return (
    <Card className="p-6 text-center text-sm text-muted-foreground border-dashed space-y-3">
      <p>{msg}</p>
      <Link to="/auth"><Button size="sm"><LogIn className="h-4 w-4 mr-1" /> Sign in</Button></Link>
    </Card>
  );
}
