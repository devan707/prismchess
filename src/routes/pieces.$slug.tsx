import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PieceById } from "@/components/chess/PieceGlyph";
import type { PieceDef } from "@/game/types";
import { PieceWorthBadge } from "@/components/pieces/PieceWorthBadge";
import {
  getPieceBySlug,
  likePiece,
  listPieceShowcases,
  createPieceShowcase,
} from "@/lib/piece-builder.functions";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Heart, MessageSquarePlus, Share2, Twitter, Facebook, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pieces/$slug")({
  loader: async ({ params }) => {
    const piece = await getPieceBySlug({ data: { slug: params.slug } });
    if (!piece) throw notFound();
    return { piece };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.piece;
    if (!p) return { meta: [{ title: "Custom piece — Prism Chess" }] };
    const title = `${p.name} — a custom chess piece on Prism Chess`;
    const description = (p.description || `A community-designed chess piece by @${p.author?.username ?? "anon"}. Drop it into your own custom games on Prism Chess.`).slice(0, 160);
    const ogImage = p.image_url ? (p.image_url.startsWith("http") ? p.image_url : `https://prismchess.app${p.image_url}`) : undefined;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        ...(ogImage ? [
          { property: "og:image", content: ogImage },
          { name: "twitter:image", content: ogImage },
        ] : []),
        { name: "twitter:card", content: ogImage ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },
  component: PieceDetail,
  notFoundComponent: () => (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-md mx-auto text-center">
      <h1 className="font-display text-2xl font-semibold mb-2">Piece not found</h1>
      <p className="text-sm text-muted-foreground mb-4">It may be private or have been removed.</p>
      <Link to="/pieces"><Button variant="outline">Browse all pieces</Button></Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-md mx-auto text-center">
      <h1 className="font-display text-2xl font-semibold mb-2">Something went wrong</h1>
      <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
      <Link to="/pieces"><Button variant="outline">Back to library</Button></Link>
    </div>
  ),
});

function PieceDetail() {
  const { piece } = Route.useLoaderData();
  const navigate = useNavigate();
  const def: PieceDef = { ...(piece.def as PieceDef), imageUrl: piece.image_url ?? (piece.def as PieceDef).imageUrl };
  const [authed, setAuthed] = useState(false);
  const [showcases, setShowcases] = useState<{ id: string; title: string; reply_count: number; like_count: number }[]>([]);
  const [showShowcase, setShowShowcase] = useState(false);
  const [showcaseTitle, setShowcaseTitle] = useState(`Check out my piece: ${piece.name}`);
  const [showcaseBody, setShowcaseBody] = useState("");
  const [posting, setPosting] = useState(false);
  const like = useServerFn(likePiece);
  const listShowcases = useServerFn(listPieceShowcases);
  const createShowcase = useServerFn(createPieceShowcase);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    void listShowcases({ data: { pieceId: piece.id } }).then((r) => setShowcases(r as never));
  }, [piece.id, listShowcases]);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/pieces/${piece.slug}` : `https://prismchess.app/pieces/${piece.slug}`;
  const shareText = `Check out "${piece.name}" — a custom chess piece on Prism Chess`;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy link"); }
  };

  const nativeShare = async () => {
    if (!navigator.share) { copyLink(); return; }
    try {
      await navigator.share({ title: piece.name, text: shareText, url: shareUrl });
    } catch { /* user cancelled */ }
  };

  const onLike = async () => {
    if (!authed) { navigate({ to: "/auth" }); return; }
    try { await like({ data: { pieceId: piece.id } }); toast.success("Liked"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't like"); }
  };

  const submitShowcase = async () => {
    if (!authed) { navigate({ to: "/auth" }); return; }
    if (showcaseTitle.trim().length < 3) { toast.error("Title is too short."); return; }
    if (showcaseBody.trim().length < 1) { toast.error("Add a description for your showcase."); return; }
    setPosting(true);
    try {
      const res = await createShowcase({ data: { pieceId: piece.id, title: showcaseTitle.trim(), body: showcaseBody.trim() } });
      toast.success("Showcase posted to the forum");
      navigate({ to: "/forum/$topicId", params: { topicId: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post showcase");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-3xl mx-auto px-4 pt-6 pb-4 flex items-center justify-between gap-3">
        <Link to="/pieces"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Library</Button></Link>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={nativeShare}><Share2 className="h-4 w-4 mr-1" /> Share</Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-16 space-y-6">
        {/* Hero card */}
        <section className="rounded-xl border bg-card p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-32 h-32 rounded-lg bg-stone-200 dark:bg-stone-700 flex items-center justify-center shrink-0">
            <PieceById id={def.id} color="w" def={def} className="text-7xl" />
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <h1 className="font-display text-3xl font-bold tracking-tight">{piece.name}</h1>
            {piece.author && (
              <p className="text-sm text-muted-foreground mt-1">
                by{" "}
                <Link to="/u/$username" params={{ username: piece.author.username }} className="hover:underline font-medium">
                  @{piece.author.username}
                </Link>
              </p>
            )}
            {piece.description && (
              <p className="text-sm mt-3 text-foreground/90">{piece.description}</p>
            )}
            <div className="mt-3 flex items-center justify-center sm:justify-start gap-3 flex-wrap">
              <PieceWorthBadge id={def.id} def={def} />
              <button onClick={onLike} className="text-sm flex items-center gap-1 text-muted-foreground hover:text-rose-500">
                <Heart className="h-4 w-4" /> {piece.like_count}
              </button>
            </div>
          </div>
        </section>

        {/* Sharing */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="font-display text-lg font-semibold">Share this piece</h2>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank" rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
            >
              <Twitter className="h-4 w-4" /> Share on X
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
              target="_blank" rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
            >
              <Facebook className="h-4 w-4" /> Share on Facebook
            </a>
            <a
              href={`https://www.reddit.com/submit?title=${encodeURIComponent(piece.name)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank" rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50"
            >
              Share on Reddit
            </a>
            <button onClick={copyLink} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted/50">
              <LinkIcon className="h-4 w-4" /> Copy link
            </button>
          </div>
        </section>

        {/* Forum showcases */}
        <section className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">Discussions & showcases</h2>
            <Button size="sm" variant="outline" onClick={() => setShowShowcase((v) => !v)}>
              <MessageSquarePlus className="h-4 w-4 mr-1" /> {showShowcase ? "Cancel" : "Start a discussion"}
            </Button>
          </div>

          {showShowcase && (
            <div className="space-y-2 rounded-md border bg-background p-3">
              <Input
                value={showcaseTitle}
                onChange={(e) => setShowcaseTitle(e.target.value)}
                placeholder="Title"
                maxLength={140}
              />
              <Textarea
                value={showcaseBody}
                onChange={(e) => setShowcaseBody(e.target.value)}
                placeholder={`What do you love about ${piece.name}? Any strategy tips? How does it pair with other pieces?`}
                rows={4}
                maxLength={8000}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowShowcase(false)}>Cancel</Button>
                <Button size="sm" onClick={submitShowcase} disabled={posting}>
                  {posting ? "Posting…" : "Post to forum"}
                </Button>
              </div>
            </div>
          )}

          {showcases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No discussions yet. Be the first to start one!</p>
          ) : (
            <ul className="divide-y">
              {showcases.map((t) => (
                <li key={t.id} className="py-2">
                  <Link to="/forum/$topicId" params={{ topicId: t.id }} className="text-sm font-medium hover:underline">
                    {t.title}
                  </Link>
                  <span className="text-xs text-muted-foreground ml-2">
                    {t.reply_count} replies · {t.like_count} likes
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
