import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createTopic } from "@/lib/forum.functions";
import { getMyRole } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Gamepad2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/forum/new")({
  head: () => ({ meta: [{ title: "New topic — Kingdom Chess" }] }),
  component: NewTopicPage,
});

const SHARE_KEY = "forum:pendingShare";

type PendingShare = { design: unknown; name: string };

function NewTopicPage() {
  const navigate = useNavigate();
  const create = useServerFn(createTopic);
  const fetchRole = useServerFn(getMyRole);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [share, setShare] = useState<PendingShare | null>(null);

  useEffect(() => {
    fetchRole({})
      .then((r) => {
        if (r.isAdmin || r.isModerator) setAuthorized(true);
        else { setAuthorized(false); navigate({ to: "/forum/suggest" }); }
      })
      .catch(() => setAuthorized(false));
    try {
      const raw = localStorage.getItem(SHARE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingShare;
        setShare(parsed);
        setTitle((t) => t || `Check out my variant: ${parsed.name}`);
      }
    } catch {}
  }, [fetchRole, navigate]);

  const clearShare = () => {
    setShare(null);
    localStorage.removeItem(SHARE_KEY);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await create({
        data: {
          title: title.trim(),
          body: body.trim(),
          isFeatured,
          sharedDesign: share ? { design: share.design, name: share.name } : undefined,
        },
      });
      localStorage.removeItem(SHARE_KEY);
      navigate({ to: "/forum/$topicId", params: { topicId: id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setBusy(false);
    }
  };

  if (authorized === null) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-2xl mx-auto px-4 pt-6">
        <Link to="/forum" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to community
        </Link>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-bold mb-4">New topic</h1>
        <form onSubmit={submit} className="space-y-4">
          {share && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <span className="inline-flex items-center gap-2">
                <Gamepad2 className="h-4 w-4 text-primary" />
                Attached game: <strong>{share.name}</strong>
              </span>
              <button type="button" onClick={clearShare} className="text-muted-foreground hover:text-foreground" aria-label="Remove attached game">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" required minLength={3} maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" required minLength={1} maxLength={8000} rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isFeatured} onCheckedChange={(v) => setIsFeatured(Boolean(v))} />
            Mark as featured
          </label>
          <Button type="submit" disabled={busy}>Post topic</Button>
        </form>
      </main>
    </div>
  );
}
