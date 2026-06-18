import { createFileRoute, Link, useNavigate, useRouter, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PieceBuilderForm, type PieceBuilderInitial } from "@/components/pieces/PieceBuilderForm";
import { ArrowLeft } from "lucide-react";
import { getMyPieceBySlug } from "@/lib/piece-builder.functions";
import type { PieceDef } from "@/game/types";

export const Route = createFileRoute("/pieces/$slug/edit")({
  head: () => ({
    meta: [
      { title: "Edit piece — Prism Chess" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditPiece,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-3 text-center">
        <h1 className="font-display text-xl font-bold">Couldn't load this piece</h1>
        <p className="text-sm text-muted-foreground max-w-md">{error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Try again</Button>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-3 text-center">
      <h1 className="font-display text-xl font-bold">Piece not found</h1>
      <p className="text-sm text-muted-foreground">You can only edit pieces you created.</p>
      <Link to="/create"><Button>Back to My Creations</Button></Link>
    </div>
  ),
});

function EditPiece() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const getPiece = useServerFn(getMyPieceBySlug);

  const { data, isLoading } = useQuery({
    queryKey: ["my-piece-by-slug", slug],
    queryFn: () => getPiece({ data: { slug } }),
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data) {
    throw notFound();
  }

  const initial: PieceBuilderInitial = {
    pieceId: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description ?? "",
    def: data.def as unknown as PieceDef,
    visibility: (data.visibility as "private" | "public") ?? "private",
    imageUrl: data.image_url ?? null,
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-5xl mx-auto px-4 pt-6 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/create">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> My Creations
            </Button>
          </Link>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Edit "{data.name}"</h1>
            <p className="text-xs text-muted-foreground">
              Changes save back to this same piece and refresh any of your own published variants that use it.
              Other people's games keep their original snapshot.
            </p>
          </div>
        </div>
        <Link to="/pieces/$slug" params={{ slug }}>
          <Button variant="outline" size="sm">View detail</Button>
        </Link>
      </header>
      <main className="max-w-5xl mx-auto px-4 pb-12">
        <PieceBuilderForm
          initial={initial}
          onSaved={() => navigate({ to: "/create" })}
        />
      </main>
    </div>
  );
}
