import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/profile.functions";
import {
  adminListAllPieces,
  adminListAllPublishedGames,
  adminSetCustomPieceFlags,
  adminDeleteCustomPiece,
  adminSetPublishedGameFlags,
  adminDeletePublishedGame,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Star, EyeOff, Trash2, Pencil, Eye } from "lucide-react";
import { toast } from "sonner";
import { PromoteAnnouncementDialog, type PromotionTarget } from "@/components/admin/PromoteAnnouncementDialog";

export const Route = createFileRoute("/_authenticated/admin/content")({
  head: () => ({ meta: [{ title: "Admin · Content library — Prism Chess" }, { name: "robots", content: "noindex" }] }),
  component: ContentPage,
});

type Tab = "pieces" | "variants";
type Filter = "all" | "signature" | "hidden" | "public";

type PieceRow = Awaited<ReturnType<typeof adminListAllPieces>>[number];
type GameRow = Awaited<ReturnType<typeof adminListAllPublishedGames>>[number];

function ContentPage() {
  const fetchRole = useServerFn(getMyRole);
  const listPieces = useServerFn(adminListAllPieces);
  const listGames = useServerFn(adminListAllPublishedGames);
  const setPieceFlags = useServerFn(adminSetCustomPieceFlags);
  const delPiece = useServerFn(adminDeleteCustomPiece);
  const setGameFlags = useServerFn(adminSetPublishedGameFlags);
  const delGame = useServerFn(adminDeletePublishedGame);
  const navigate = useNavigate();

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("pieces");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [pieces, setPieces] = useState<PieceRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoTarget, setPromoTarget] = useState<PromotionTarget | null>(null);

  useEffect(() => {
    fetchRole({}).then((r) => setAllowed(r.isAdmin || r.isModerator)).catch(() => setAllowed(false));
  }, [fetchRole]);

  const reload = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      if (tab === "pieces") {
        const rows = await listPieces({ data: { q: q.trim() || undefined, filter } });
        setPieces(rows as PieceRow[]);
      } else {
        const rows = await listGames({ data: { q: q.trim() || undefined, filter } });
        setGames(rows as GameRow[]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [allowed, tab, filter, q, listPieces, listGames]);

  useEffect(() => { void reload(); }, [reload]);

  if (allowed === null) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6">
      <h1 className="font-display text-xl font-bold">Not authorized</h1>
      <Link to="/"><Button size="sm">Home</Button></Link>
    </div>
  );

  const filters: { v: Filter; label: string }[] = [
    { v: "all", label: "All" },
    { v: "signature", label: "Signature" },
    { v: "public", label: "Public" },
    { v: "hidden", label: "Archived" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between border-b">
        <h1 className="font-display text-lg font-semibold">Content library</h1>
        <Link to="/"><Button size="sm" variant="ghost">Home</Button></Link>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border bg-card p-0.5">
            <button onClick={() => setTab("pieces")} className={`px-3 py-1.5 text-sm rounded ${tab === "pieces" ? "bg-primary text-primary-foreground" : ""}`}>Pieces</button>
            <button onClick={() => setTab("variants")} className={`px-3 py-1.5 text-sm rounded ${tab === "variants" ? "bg-primary text-primary-foreground" : ""}`}>Variants</button>
          </div>
          <div className="inline-flex rounded-md border bg-card p-0.5">
            {filters.map((f) => (
              <button key={f.v} onClick={() => setFilter(f.v)} className={`px-2.5 py-1.5 text-xs rounded ${filter === f.v ? "bg-secondary" : ""}`}>{f.label}</button>
            ))}
          </div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            className="h-9 max-w-xs"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tab === "pieces" ? (
          <PieceTable
            rows={pieces}
            onPromote={async (r) => {
              const res = await setPieceFlags({ data: { pieceId: r.id, isFeatured: !r.is_featured } });
              toast.success(r.is_featured ? "Demoted" : "Promoted to signature piece");
              if (res.promoted && res.target) setPromoTarget(res.target);
              reload();
            }}
            onArchive={async (r) => {
              if (!r.is_hidden && !window.confirm(`Archive "${r.name}"?`)) return;
              await setPieceFlags({ data: { pieceId: r.id, isHidden: !r.is_hidden } });
              toast.success(r.is_hidden ? "Unarchived" : "Archived");
              reload();
            }}
            onEdit={(r) => navigate({ to: "/pieces/$slug/edit", params: { slug: r.slug } })}
            onView={(r) => navigate({ to: "/pieces/$slug", params: { slug: r.slug } })}
            onDelete={async (r) => {
              const confirm = window.prompt(`Type the piece name to permanently delete:\n${r.name}`);
              if (confirm !== r.name) { toast.error("Name mismatch — delete cancelled"); return; }
              await delPiece({ data: { pieceId: r.id } });
              toast.success("Deleted");
              reload();
            }}
          />
        ) : (
          <VariantTable
            rows={games}
            onPromote={async (r) => {
              await setGameFlags({ data: { gameId: r.id, isFeatured: !r.is_featured } });
              toast.success(r.is_featured ? "Demoted" : "Promoted to signature variant");
              reload();
            }}
            onArchive={async (r) => {
              if (!r.is_hidden && !window.confirm(`Archive "${r.name}"?`)) return;
              await setGameFlags({ data: { gameId: r.id, isHidden: !r.is_hidden } });
              toast.success(r.is_hidden ? "Unarchived" : "Archived");
              reload();
            }}
            onEdit={(r) => navigate({ to: "/sandbox", search: { edit: r.id } as never })}
            onView={(r) => navigate({ to: "/g/$slug", params: { slug: r.slug } })}
            onDelete={async (r) => {
              const confirm = window.prompt(`Type the variant name to permanently delete:\n${r.name}`);
              if (confirm !== r.name) { toast.error("Name mismatch — delete cancelled"); return; }
              await delGame({ data: { gameId: r.id } });
              toast.success("Deleted");
              reload();
            }}
          />
        )}
      </main>
    </div>
  );
}

type RowActions<T> = {
  rows: T[];
  onPromote: (r: T) => void | Promise<void>;
  onArchive: (r: T) => void | Promise<void>;
  onEdit: (r: T) => void;
  onView: (r: T) => void;
  onDelete: (r: T) => void | Promise<void>;
};

function StatusBadges({ featured, hidden }: { featured: boolean; hidden: boolean }) {
  return (
    <div className="flex gap-1">
      {featured && <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium"><Star className="h-2.5 w-2.5" /> Signature</span>}
      {hidden && <span className="inline-flex items-center gap-0.5 rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium"><EyeOff className="h-2.5 w-2.5" /> Archived</span>}
    </div>
  );
}

function PieceTable({ rows, onPromote, onArchive, onEdit, onView, onDelete }: RowActions<PieceRow>) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No pieces match.</p>;
  return (
    <ul className="divide-y rounded-md border bg-card">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => onView(r)} className="font-medium hover:underline truncate">{r.name}</button>
              <StatusBadges featured={!!r.is_featured} hidden={!!r.is_hidden} />
            </div>
            <div className="text-xs text-muted-foreground">
              by @{r.author?.username ?? "—"} · {r.like_count} likes · {new Date(r.created_at).toLocaleDateString()} · {r.visibility}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => onView(r)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(r)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant={r.is_featured ? "default" : "outline"} onClick={() => onPromote(r)} title={r.is_featured ? "Demote" : "Promote to signature"}>
              <Star className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onArchive(r)} title={r.is_hidden ? "Unarchive" : "Archive"}>
              <EyeOff className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDelete(r)} title="Delete" className="text-red-600 hover:text-red-700">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function VariantTable({ rows, onPromote, onArchive, onEdit, onView, onDelete }: RowActions<GameRow>) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No variants match.</p>;
  return (
    <ul className="divide-y rounded-md border bg-card">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => onView(r)} className="font-medium hover:underline truncate">{r.name}</button>
              <StatusBadges featured={!!r.is_featured} hidden={!!r.is_hidden} />
            </div>
            <div className="text-xs text-muted-foreground">
              by @{r.author?.username ?? "—"} · {r.like_count} likes · {r.comment_count} comments · {new Date(r.created_at).toLocaleDateString()}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => onView(r)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(r)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant={r.is_featured ? "default" : "outline"} onClick={() => onPromote(r)} title={r.is_featured ? "Demote" : "Promote to signature"}>
              <Star className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onArchive(r)} title={r.is_hidden ? "Unarchive" : "Archive"}>
              <EyeOff className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDelete(r)} title="Delete" className="text-red-600 hover:text-red-700">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
