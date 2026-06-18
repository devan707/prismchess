import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listTopics, toggleLike } from "@/lib/forum.functions";
import { getMyRole } from "@/lib/profile.functions";
import { adminDeleteForumTopic, adminSetTopicFlags } from "@/lib/admin.functions";
import { AdminMenu } from "@/components/admin/AdminMenu";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart, MessageSquare, PlusCircle, Lightbulb, Pin, Star, Gamepad2, Play } from "lucide-react";
import { toast } from "sonner";
import { saveDesign } from "@/game/design";
import type { Design } from "@/game/types";

export const Route = createFileRoute("/_authenticated/forum/")({
  head: () => ({
    meta: [
      { title: "Community — Prism Chess" },
      { name: "description", content: "Discuss strategy, share variant designs, and report bugs." },
    ],
  }),
  component: ForumPage,
});

type Topic = Awaited<ReturnType<typeof listTopics>>[number];

function ForumPage() {
  const navigate = useNavigate();
  const fetchTopics = useServerFn(listTopics);
  const fetchRole = useServerFn(getMyRole);
  const like = useServerFn(toggleLike);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = () => fetchTopics({}).then(setTopics).catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
    fetchRole({}).then((r) => setIsAdmin(r.isAdmin || r.isModerator)).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const onLike = async (t: Topic) => {
    setTopics((prev) =>
      prev?.map((x) => x.id === t.id ? { ...x, liked_by_me: !x.liked_by_me, like_count: x.like_count + (x.liked_by_me ? -1 : 1) } : x) ?? prev,
    );
    try { await like({ data: { targetType: "topic", targetId: t.id } }); } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      load();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-3xl mx-auto px-4 pt-6 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Home
        </Link>
        {isAdmin ? (
          <Link to="/forum/new">
            <Button size="sm"><PlusCircle className="h-4 w-4 mr-1" /> New topic</Button>
          </Link>
        ) : (
          <Link to="/forum/suggest">
            <Button size="sm" variant="outline"><Lightbulb className="h-4 w-4 mr-1" /> Suggest a topic</Button>
          </Link>
        )}
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-3xl font-bold">Community</h1>
        <p className="text-muted-foreground text-sm mb-6">Strategy, variant designs, bug reports.</p>

        {topics === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : topics.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No topics yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {topics.map((t) => (
              <li
                key={t.id}
                className={`rounded-xl border bg-card p-4 hover:border-primary transition ${t.is_featured ? "border-primary/60 bg-primary/5" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Link to="/forum/$topicId" params={{ topicId: t.id }} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {t.is_pinned && <Pin className="h-3 w-3 text-muted-foreground" aria-label="Pinned" />}
                      {t.is_featured && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/20 text-primary font-semibold">
                          <Star className="h-3 w-3" /> Featured
                        </span>
                      )}
                      {t.shared_design_name && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/30 text-accent-foreground">
                          <Gamepad2 className="h-3 w-3" /> Custom game
                        </span>
                      )}
                    </div>
                    <h2 className="font-display font-semibold truncate">{t.title}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {t.author?.display_name ?? t.author?.username ?? "unknown"} · {new Date(t.last_activity_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{t.body}</p>
                  </Link>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {t.shared_design && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          try {
                            saveDesign(t.shared_design as unknown as Design);
                            navigate({ to: "/play" });
                          } catch {
                            toast.error("Couldn't load that game.");
                          }
                        }}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" /> Play
                      </Button>
                    )}
                    <button
                      onClick={() => onLike(t)}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${t.liked_by_me ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${t.liked_by_me ? "fill-current" : ""}`} /> {t.like_count}
                    </button>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" /> {t.reply_count}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
