import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createTopic } from "@/lib/forum.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/forum/new")({
  head: () => ({ meta: [{ title: "New topic — Kingdom Chess" }] }),
  component: NewTopicPage,
});

function NewTopicPage() {
  const navigate = useNavigate();
  const create = useServerFn(createTopic);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await create({ data: { title: title.trim(), body: body.trim() } });
      navigate({ to: "/forum/$topicId", params: { topicId: id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
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
        <h1 className="font-display text-2xl font-bold mb-4">New topic</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" required minLength={3} maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" required minLength={1} maxLength={8000} rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy}>Post topic</Button>
        </form>
      </main>
    </div>
  );
}
