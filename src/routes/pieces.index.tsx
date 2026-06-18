import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PieceById } from "@/components/chess/PieceGlyph";
import type { PieceDef } from "@/game/types";
import { listDiscoveryPieces, likePiece } from "@/lib/piece-builder.functions";
import { adminSetCustomPieceFlags, adminDeleteCustomPiece } from "@/lib/admin.functions";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminMenu } from "@/components/admin/AdminMenu";
import { ArrowLeft, Heart, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pieces/")({
  head: () => ({
    meta: [
      { title: "Custom piece library — Prism Chess" },
      { name: "description", content: "Browse player-designed chess pieces. Like your favorites and drop them into your own custom games." },
    ],
  }),
  component: PiecesIndex,
});

type Row = {
  id: string;
  slug: string;
  name: string;
  description: string;
  def: unknown;
  visibility: string;
  like_count: number;
  created_at: string;
  author_id: string;
};

function PiecesIndex() {
  const [newest, setNewest] = useState<Row[]>([]);
  const [popular, setPopular] = useState<Row[]>([]);
  const [archive, setArchive] = useState<Row[]>([]);
  const fetchDiscovery = useServerFn(listDiscoveryPieces);
  const like = useServerFn(likePiece);

  const refresh = async () => {
    const d = await fetchDiscovery();
    setNewest(d.newest as Row[]);
    setPopular(d.popular as Row[]);
    setArchive(d.archive as Row[]);
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, []);

  const handleLike = async (row: Row) => {
    try {
      await like({ data: { pieceId: row.id } });
      toast.success("Liked");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't like");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-5xl mx-auto px-4 pt-6 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Home</Button></Link>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Custom piece library</h1>
            <p className="text-xs text-muted-foreground">Pieces built by the community. Drop them into your own games from the Sandbox.</p>
          </div>
        </div>
        <Link to="/pieces/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create new</Button></Link>
      </header>
      <main className="max-w-5xl mx-auto px-4 pb-12 space-y-8">
        <Section title="New" rows={newest} onLike={handleLike} reload={refresh} />
        <Section title="Popular" rows={popular} onLike={handleLike} reload={refresh} />
        {archive.length > 0 && <Section title="Archive" rows={archive} onLike={handleLike} reload={refresh} />}
      </main>
    </div>
  );
}

function Section({ title, rows, onLike, reload }: { title: string; rows: Row[]; onLike: (r: Row) => void; reload: () => Promise<void> | void }) {
  const { isModOrAdmin } = useIsAdmin();
  const setFlags = useServerFn(adminSetCustomPieceFlags);
  const del = useServerFn(adminDeleteCustomPiece);
  if (rows.length === 0) {
    return (
      <section>
        <h2 className="font-display text-xl font-semibold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="font-display text-xl font-semibold mb-3">{title}</h2>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((row) => {
          const def = row.def as PieceDef;
          return (
            <li key={row.id} className="rounded-lg border bg-card p-3 flex items-start gap-3">
              <div className="w-14 h-14 rounded bg-stone-200 dark:bg-stone-700 flex items-center justify-center flex-shrink-0">
                <PieceById id={def.id} color="w" def={def} className="text-4xl" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm truncate">{row.name}</h3>
                  <AdminMenu
                    show={isModOrAdmin}
                    actions={[
                      { label: "Hide from feeds", onClick: async () => { await setFlags({ data: { pieceId: row.id, isHidden: true } }); await reload(); } },
                      { label: "Feature", onClick: async () => { await setFlags({ data: { pieceId: row.id, isFeatured: true } }); await reload(); } },
                      { label: "Delete piece", destructive: true, confirm: `Delete "${row.name}"?`, onClick: async () => { await del({ data: { pieceId: row.id } }); await reload(); } },
                    ]}
                  />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{row.description || "—"}</p>
                <button
                  onClick={() => onLike(row)}
                  className="mt-1 text-xs flex items-center gap-1 text-muted-foreground hover:text-rose-500"
                >
                  <Heart className="h-3.5 w-3.5" /> {row.like_count}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
