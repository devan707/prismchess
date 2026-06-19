import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Home, Heart, MessageSquare, Play, Trash2, Pencil, Wand2, Swords } from "lucide-react";
import { CreateChallengeDialog } from "@/components/multiplayer/CreateChallengeDialog";
import {
  getPublishedGame, listComments, addComment, deleteComment, toggleLike, getMyLikeState,
} from "@/lib/social.functions";
import { ReportDialog } from "@/components/social/ReportDialog";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { adminDeleteGameComment, adminSetPublishedGameFlags, adminDeletePublishedGame } from "@/lib/admin.functions";
import { AdminMenu, type AdminAction } from "@/components/admin/AdminMenu";
import { PromoteAnnouncementDialog, type PromotionTarget } from "@/components/admin/PromoteAnnouncementDialog";
import { supabase } from "@/integrations/supabase/client";
import { saveCurrentMeta, saveDesign } from "@/game/design";
import type { Design } from "@/game/types";
import type { GameTutorial } from "@/game/tutorials";
import { GamePreview } from "@/components/chess/GamePreview";
import { ShareGameButton } from "@/components/social/ShareGameButton";
import { toast } from "sonner";

export const Route = createFileRoute("/g/$slug")({
  head: () => ({
    meta: [
      { title: "Shared game — Prism Chess" },
      { name: "description", content: "A custom chess variant shared on Prism Chess." },
    ],
  }),
  component: SharedGamePage,
});

function SharedGamePage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const fetchGame = useServerFn(getPublishedGame);
  const fetchComments = useServerFn(listComments);
  const addCmt = useServerFn(addComment);
  const delCmt = useServerFn(deleteComment);
  const like = useServerFn(toggleLike);
  const fetchLike = useServerFn(getMyLikeState);
  const { isModOrAdmin } = useIsAdmin();
  const adminDelCmt = useServerFn(adminDeleteGameComment);
  const adminFlags = useServerFn(adminSetPublishedGameFlags);
  const adminDelGame = useServerFn(adminDeletePublishedGame);

  type GameRes = Awaited<ReturnType<typeof getPublishedGame>>;
  type Comment = Awaited<ReturnType<typeof listComments>>[number];
  const [data, setData] = useState<GameRes>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [body, setBody] = useState("");
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [promoTarget, setPromoTarget] = useState<PromotionTarget | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMeId(u.user?.id ?? null);
      const g = await fetchGame({ data: { slug } });
      setData(g);
      if (g) {
        setLikeCount(g.game.like_count);
        const c = await fetchComments({ data: { gameId: g.game.id } });
        setComments(c);
        if (u.user) {
          const ls = await fetchLike({ data: { gameId: g.game.id } });
          setLiked(ls.liked);
        }
      }
    })();
  }, [slug]);

  if (data === null) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="min-h-screen flex flex-col items-center justify-center gap-3"><p className="text-sm text-muted-foreground">Game not found.</p><Link to="/"><Button size="sm">Home</Button></Link></div>;

  const { game, author, remixedFrom } = data;

  const handlePlay = () => {
    saveDesign(game.design as unknown as Design);
    saveCurrentMeta({
      id: `published:${game.id}`,
      name: game.name,
      description: game.description,
      tutorial: (game.tutorial as unknown as GameTutorial) ?? undefined,
    });
    navigate({ to: "/play" });
  };

  const handleLike = async () => {
    if (!meId) { navigate({ to: "/auth" }); return; }
    try {
      const r = await like({ data: { gameId: game.id } });
      setLiked(r.liked);
      setLikeCount((c) => c + (r.liked ? 1 : -1));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meId) { navigate({ to: "/auth" }); return; }
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await addCmt({ data: { gameId: game.id, body: text } });
      setBody("");
      setComments(await fetchComments({ data: { gameId: game.id } }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await delCmt({ data: { commentId: id } });
      setComments((c) => c.filter((x) => x.id !== id));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between border-b">
        <Link to="/"><Button variant="ghost" size="icon"><Home className="h-4 w-4" /></Button></Link>
        <h1 className="font-display text-lg font-semibold truncate">{game.name}</h1>
        <div className="w-10" />
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>
                by{" "}
                {author ? (
                  <Link to="/u/$username" params={{ username: author.username }} className="underline">
                    {author.display_name ?? author.username}
                  </Link>
                ) : "unknown"}
              </div>
              {remixedFrom && (
                <div>
                  Remixed from{" "}
                  <Link to="/g/$slug" params={{ slug: remixedFrom.slug }} className="underline font-medium">
                    "{remixedFrom.name}"
                  </Link>
                  {remixedFrom.author && (
                    <>
                      {" "}by{" "}
                      <Link to="/u/$username" params={{ username: remixedFrom.author.username }} className="underline font-medium">
                        @{remixedFrom.author.username}
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
            <ReportDialog targetType="game" targetId={game.id} size="icon" label="" />
          </div>
          <p className="text-sm whitespace-pre-wrap">{game.description}</p>

          {game.design ? (
            <div className="mt-4">
              <GamePreview design={game.design as unknown as Design} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button size="sm" onClick={handlePlay}><Play className="h-3 w-3 mr-1" /> Play vs AI</Button>
            <Button size="sm" variant="outline" onClick={() => setChallengeOpen(true)}>
              <Swords className="h-3 w-3 mr-1" /> Challenge a friend
            </Button>
            <Button size="sm" variant={liked ? "default" : "outline"} onClick={handleLike}>
              <Heart className={`h-3 w-3 mr-1 ${liked ? "fill-current" : ""}`} /> {likeCount}
            </Button>
            <ShareGameButton slug={game.slug} name={game.name} description={game.description} />
            {(meId === game.author_id || isModOrAdmin) ? (
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/sandbox", search: { edit: game.id } as never })}>
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => navigate({ to: "/sandbox", search: { remix: game.slug } as never })} title="Open this variant in the sandbox and save as your own">
                <Wand2 className="h-3 w-3 mr-1" /> Remix
              </Button>
            )}
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {comments.length}
            </span>
            <AdminMenu
              show={isModOrAdmin}
              actions={(() => {
                const g = game as typeof game & { is_featured?: boolean; is_hidden?: boolean };
                const isFeat = !!g.is_featured;
                const isHidden = !!g.is_hidden;
                const acts: AdminAction[] = [
                  {
                    label: isFeat ? "Demote from signature" : "Promote to signature",
                    onClick: async () => {
                      const res = await adminFlags({ data: { gameId: game.id, isFeatured: !isFeat } });
                      toast.success(isFeat ? "Demoted" : "Promoted to signature variant");
                      if (res.promoted && res.target) setPromoTarget(res.target);
                      const fresh = await fetchGame({ data: { slug } });
                      setData(fresh);
                    },
                  },
                  {
                    label: isHidden ? "Unarchive" : "Archive (hide)",
                    confirm: isHidden ? undefined : "Archive this variant? It will be hidden from discovery and play.",
                    onClick: async () => {
                      await adminFlags({ data: { gameId: game.id, isHidden: !isHidden } });
                      toast.success(isHidden ? "Unarchived" : "Archived");
                      const fresh = await fetchGame({ data: { slug } });
                      setData(fresh);
                    },
                  },
                  {
                    label: "Delete permanently",
                    destructive: true,
                    confirm: `Permanently delete "${game.name}"? This cannot be undone.`,
                    onClick: async () => {
                      await adminDelGame({ data: { gameId: game.id } });
                      toast.success("Deleted");
                      navigate({ to: "/" });
                    },
                  },
                ];
                return acts;
              })()}
            />

          </div>
        </section>

        <section>
          <h2 className="font-display font-semibold mb-2">Comments</h2>
          {meId ? (
            <form onSubmit={handleComment} className="mb-4 space-y-2">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share your thoughts…" maxLength={1000} rows={3} />
              <Button size="sm" type="submit" disabled={busy || !body.trim()}>Post comment</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground mb-4"><Link to="/auth" className="underline">Sign in</Link> to like and comment.</p>
          )}
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet. Be the first.</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-xs">
                      {c.author ? (
                        <Link to="/u/$username" params={{ username: c.author.username }} className="font-medium hover:underline">
                          {c.author.display_name ?? c.author.username}
                        </Link>
                      ) : "unknown"}
                      <span className="text-muted-foreground"> · {new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ReportDialog targetType="comment" targetId={c.id} size="icon" label="" />
                      {c.author_id === meId && (
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}><Trash2 className="h-3 w-3" /></Button>
                      )}
                      {isModOrAdmin && c.author_id !== meId && (
                        <Button
                          size="icon" variant="ghost"
                          title="Admin delete"
                          onClick={async () => {
                            if (!window.confirm("Delete this comment (admin)?")) return;
                            try { await adminDelCmt({ data: { commentId: c.id } }); setComments((p) => p.filter((x) => x.id !== c.id)); }
                            catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <CreateChallengeDialog
        open={challengeOpen}
        onOpenChange={setChallengeOpen}
        presetDesign={{ design: game.design as unknown as Design, name: game.name }}
      />
    </div>
  );
}
