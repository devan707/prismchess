import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Home, Play, Swords, ArrowLeft, MessagesSquare } from "lucide-react";
import { BUILTIN_GAMES, tutorialForBuiltin } from "@/game/library";
import { saveCurrentMeta, saveDesign } from "@/game/design";
import { GamePreview } from "@/components/chess/GamePreview";
import { ShareGameButton } from "@/components/social/ShareGameButton";
import { CreateChallengeDialog } from "@/components/multiplayer/CreateChallengeDialog";

export const Route = createFileRoute("/v/$id")({
  head: ({ params }) => {
    const g = BUILTIN_GAMES.find((x) => x.id === params.id);
    const title = g ? `${g.name} — Prism Chess` : "Variant — Prism Chess";
    const desc = g?.description ?? "A Prism Chess variant.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  component: VariantPage,
});

function VariantPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const game = useMemo(() => BUILTIN_GAMES.find((g) => g.id === id), [id]);
  const design = useMemo(() => (game ? game.build() : null), [game]);
  const [challengeOpen, setChallengeOpen] = useState(false);

  if (!game || !design) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Variant not found.</p>
        <Link to="/"><Button size="sm">Home</Button></Link>
      </div>
    );
  }

  const handlePlay = () => {
    saveDesign(design);
    saveCurrentMeta({
      id: `builtin:${game.id}`,
      name: game.name,
      description: game.description,
      tutorial: tutorialForBuiltin(game),
    });
    navigate({ to: "/play" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between border-b">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? window.history.back() : navigate({ to: "/" }))}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-display text-lg font-semibold truncate">{game.name}</h1>
        <Link to="/"><Button variant="ghost" size="icon" aria-label="Home"><Home className="h-4 w-4" /></Button></Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <section className="rounded-xl border bg-card p-4 space-y-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Signature variant</div>
            <p className="text-sm whitespace-pre-wrap">{game.description}</p>
          </div>

          <GamePreview design={design} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={handlePlay}><Play className="h-3 w-3 mr-1" /> Play vs AI</Button>
            <Button size="sm" variant="outline" onClick={() => setChallengeOpen(true)}>
              <Swords className="h-3 w-3 mr-1" /> Challenge a friend
            </Button>
            <ShareGameButton path={`/v/${game.id}`} name={game.name} description={game.description} />
            <Link to="/forum">
              <Button size="sm" variant="ghost"><MessagesSquare className="h-3 w-3 mr-1" /> Discuss</Button>
            </Link>
          </div>
        </section>
      </main>

      <CreateChallengeDialog
        open={challengeOpen}
        onOpenChange={setChallengeOpen}
        presetDesign={{ design, name: game.name }}
      />
    </div>
  );
}
