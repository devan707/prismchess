import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PieceBuilderForm } from "@/components/pieces/PieceBuilderForm";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/pieces/new")({
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
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Create a custom piece</h1>
            <p className="text-xs text-muted-foreground">Define how your piece moves, then save it private or publish to the community library.</p>
          </div>
        </div>
        <Link to="/pieces">
          <Button variant="outline" size="sm">Browse pieces</Button>
        </Link>
      </header>
      <main className="max-w-5xl mx-auto px-4 pb-12">
        <PieceBuilderForm onSaved={() => navigate({ to: "/sandbox" })} />
      </main>
    </div>
  );
}
