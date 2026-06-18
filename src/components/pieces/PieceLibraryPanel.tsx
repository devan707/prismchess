import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PieceById } from "@/components/chess/PieceGlyph";
import { PieceWorthBadge } from "@/components/pieces/PieceWorthBadge";
import type { PieceDef } from "@/game/types";
import {
  listDiscoveryPieces,
  listMyPieces,
  deletePiece,
  likePiece,
} from "@/lib/piece-builder.functions";
import { Heart, PackageOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onAdd: (def: PieceDef) => void;
  /** Custom piece ids already present in the design. */
  alreadyInDesign: string[];
  /** Called after deleting a piece you own — so the parent design can drop it too. */
  onRemoveFromDesign?: (id: string) => void;
}

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

type Tab = "mine" | "new" | "popular";

export function PieceLibraryPanel({ onAdd, alreadyInDesign, onRemoveFromDesign }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("new");
  const [mine, setMine] = useState<Row[]>([]);
  const [newest, setNewest] = useState<Row[]>([]);
  const [popular, setPopular] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchMine = useServerFn(listMyPieces);
  const fetchDiscovery = useServerFn(listDiscoveryPieces);
  const like = useServerFn(likePiece);
  const remove = useServerFn(deletePiece);

  const refresh = async () => {
    setLoading(true);
    try {
      const [d, m] = await Promise.all([
        fetchDiscovery(),
        fetchMine().catch(() => [] as Row[]),
      ]);
      setNewest(d.newest as Row[]);
      setPopular(d.popular as Row[]);
      setMine(m as Row[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rows = useMemo(() => {
    if (tab === "mine") return mine;
    if (tab === "popular") return popular;
    return newest;
  }, [tab, mine, newest, popular]);

  const handleAdd = (row: Row) => {
    const def = row.def as PieceDef;
    onAdd(def);
    toast.success(`Added "${row.name}" to this game`);
  };

  const handleLike = async (row: Row) => {
    try {
      await like({ data: { pieceId: row.id } });
      toast.success("Liked");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't like");
    }
  };

  const handleDelete = async (row: Row) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    try {
      await remove({ data: { pieceId: row.id } });
      const def = row.def as PieceDef;
      onRemoveFromDesign?.(def.id);
      toast.success("Deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <span className="font-display text-sm font-semibold flex items-center gap-1">
          <PackageOpen className="h-4 w-4" /> Custom piece library
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Browse"}</span>
      </button>

      {open && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-md border overflow-hidden text-xs">
              {(["new", "popular", "mine"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-2 py-1 capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Link to="/pieces/new">
              <Button size="sm" variant="outline" className="h-7">
                <Plus className="h-3.5 w-3.5 mr-1" /> New
              </Button>
            </Link>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {tab === "mine"
                ? "You haven't made any pieces yet."
                : "Nothing here yet — be the first to publish a piece!"}
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-auto pr-1">
              {rows.map((row) => {
                const def = row.def as PieceDef;
                const inDesign = alreadyInDesign.includes(def.id);
                return (
                  <li key={row.id} className="flex items-center gap-2 rounded border bg-background p-1.5">
                    <div className="w-8 h-8 rounded bg-stone-200 dark:bg-stone-700 flex items-center justify-center flex-shrink-0">
                      <PieceById id={def.id} color="w" def={def} className="text-2xl" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs font-medium truncate">{row.name}</p>
                        <PieceWorthBadge id={def.id} def={def} className="flex-shrink-0" />
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{row.description || "—"}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {tab !== "mine" && (
                        <button
                          onClick={() => handleLike(row)}
                          className="text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-rose-500"
                          title="Like"
                        >
                          <Heart className="h-3 w-3" /> {row.like_count}
                        </button>
                      )}
                      {tab === "mine" && (
                        <button
                          onClick={() => handleDelete(row)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <Button
                        size="sm"
                        variant={inDesign ? "outline" : "default"}
                        className="h-6 text-[10px] px-2"
                        onClick={() => handleAdd(row)}
                        disabled={inDesign}
                      >
                        {inDesign ? "Added" : "Add"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
