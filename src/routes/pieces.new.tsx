import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PieceBuilderForm, type PieceBuilderInitial } from "@/components/pieces/PieceBuilderForm";
import { ArrowLeft } from "lucide-react";
import { getMyPieceBySlug } from "@/lib/piece-builder.functions";
import type { PieceDef } from "@/game/types";

export const Route = createFileRoute("/pieces/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === "string" ? search.from : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Create a custom piece — Prism Chess" },
      { name: "description", content: "Design a custom chess piece: define its movement step-by-step, pick an AI-generated icon, and save it to your library or publish to the community." },
    ],
  }),
  component: NewPiece,
});

function NewPiece() {
  const navigate = useNavigate();
  const { from } = Route.useSearch();
  const getPiece = useServerFn(getMyPieceBySlug);

  const { data: source, isLoading } = useQuery({
    queryKey: ["piece-template", from],
    queryFn: () => (from ? getPiece({ data: { slug: from } }) : Promise.resolve(null)),
    enabled: !!from,
  });

  const template: PieceBuilderInitial | undefined = source
    ? {
        pieceId: source.id,
        slug: source.slug,
        name: source.name,
        description: source.description ?? "",
        def: source.def as unknown as PieceDef,
        visibility: (source.visibility as "private" | "public") ?? "private",
        imageUrl: source.image_url ?? null,
      }
    : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-5xl mx-auto px-4 pt-6 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/sandbox">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Sandbox
            </Button>
          </Link>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              {template ? `Duplicate "${template.name.replace(/ \(copy\)$/, "")}"` : "Create a custom piece"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {template
                ? "Saves as a new piece — change the name and tweak something so it's distinct."
                : "Define how your piece moves, then save it private or publish to the community library."}
            </p>
          </div>
        </div>
        <Link to="/pieces">
          <Button variant="outline" size="sm">Browse pieces</Button>
        </Link>
      </header>
      <main className="max-w-5xl mx-auto px-4 pb-12">
        {from && isLoading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Loading source piece…</div>
        ) : (
          <PieceBuilderForm
            // `key` forces a fresh form state once the template arrives.
            key={template?.pieceId ?? "blank"}
            template={template}
            onSaved={() => navigate({ to: "/sandbox" })}
          />
        )}
      </main>
    </div>
  );
}
