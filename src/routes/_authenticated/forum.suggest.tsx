import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createSuggestion } from "@/lib/forum.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Gamepad2, Lightbulb, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/forum/suggest")({
  head: () => ({ meta: [{ title: "Suggest a topic — Kingdom Chess" }] }),
  component: SuggestPage,
});

const SHARE_KEY = "forum:pendingShare";
type PendingShare = { design: unknown; name: string };

function SuggestPage() {
  const navigate = useNavigate();
  const suggest = useServerFn(createSuggestion);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<PendingShare | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHARE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingShare;
        setShare(parsed);
        setTitle((t) => t || `Featured game suggestion: ${parsed.name}`);
      }
    } catch {}
  }, []);

  const clearShare = () => {
    setShare(null);
    localStorage.removeItem(SHARE_KEY);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await suggest({
        data: {
          title: title.trim(),
          body: body.trim(),
          sharedDesign: share ? { design: share.design, name: share.name } : undefined,
        },
      });
      localStorage.removeItem(SHARE_KEY);
      toast.success("Suggestion sent! Admins will review it.");
      navigate({ to: "/forum" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-2xl mx-auto px-4 pt-6">
        <Link to="/forum" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to community
        </Link>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-bold mb-1 inline-flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-primary" /> Suggest a topic
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Only admins can post new topics, but anyone can suggest one. If we love your suggestion (or your custom game) we&apos;ll promote it.
        </p>
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
            <Label htmlFor="body">Why should we feature this?</Label>
            <Textarea id="body" required minLength={1} maxLength={8000} rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy}>Send suggestion</Button>
        </form>
      </main>
    </div>
  );
}
