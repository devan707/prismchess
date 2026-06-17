import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTopic, createReply, toggleLike } from "@/lib/forum.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Heart } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/forum/$topicId")({
  head: () => ({ meta: [{ title: "Topic — Kingdom Chess" }] }),
  component: TopicPage,
});

type TopicData = Awaited<ReturnType<typeof getTopic>>;

function TopicPage() {
  const { topicId } = Route.useParams();
  const fetchTopic = useServerFn(getTopic);
  const reply = useServerFn(createReply);
  const like = useServerFn(toggleLike);
  const [data, setData] = useState<TopicData | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetchTopic({ data: { topicId } }).then(setData).catch((e) => toast.error(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [topicId]);

  const onLike = async (type: "topic" | "reply", id: string) => {
    try { await like({ data: { targetType: type, targetId: id } }); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await reply({ data: { topicId, body: body.trim() } });
      setBody("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setBusy(false); }
  };

  if (!data) return <div className="p-6 text-muted-foreground">Loading…</div>;
  const { topic, replies } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-3xl mx-auto px-4 pt-6">
        <Link to="/forum" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to community
        </Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <article className="rounded-xl border bg-card p-5">
          <h1 className="font-display text-2xl font-bold">{topic.title}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            by {topic.author?.display_name ?? topic.author?.username ?? "unknown"} · {new Date(topic.created_at).toLocaleString()}
          </p>
          <p className="mt-4 whitespace-pre-wrap text-sm">{topic.body}</p>
          <div className="mt-4">
            <button
              onClick={() => onLike("topic", topic.id)}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded ${topic.liked_by_me ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Heart className={`h-3.5 w-3.5 ${topic.liked_by_me ? "fill-current" : ""}`} /> {topic.like_count}
            </button>
          </div>
        </article>

        <section>
          <h2 className="font-display text-lg font-semibold mb-3">{replies.length} {replies.length === 1 ? "reply" : "replies"}</h2>
          <ul className="space-y-2">
            {replies.map((r) => (
              <li key={r.id} className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">
                  {r.author?.display_name ?? r.author?.username ?? "unknown"} · {new Date(r.created_at).toLocaleString()}
                </p>
                <p className="text-sm whitespace-pre-wrap">{r.body}</p>
                <div className="mt-2">
                  <button
                    onClick={() => onLike("reply", r.id)}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${r.liked_by_me ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Heart className={`h-3 w-3 ${r.liked_by_me ? "fill-current" : ""}`} /> {r.like_count}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <form onSubmit={submit} className="space-y-2">
          <Textarea required minLength={1} maxLength={8000} rows={4} placeholder="Write a reply…" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" disabled={busy || !body.trim()}>Post reply</Button>
        </form>
      </main>
    </div>
  );
}
