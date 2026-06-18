import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/profile.functions";
import {
  adminListReports,
  adminResolveReport,
  adminListAbilityRequests,
  adminResolveAbilityRequest,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "Admin · Reports — Prism Chess" }] }),
  component: ReportsPage,
});

type Report = Awaited<ReturnType<typeof adminListReports>>[number];
type AbilityReq = Awaited<ReturnType<typeof adminListAbilityRequests>>[number];

type Tab = "reports" | "abilities";

function ReportsPage() {
  const fetchRole = useServerFn(getMyRole);
  const list = useServerFn(adminListReports);
  const resolve = useServerFn(adminResolveReport);
  const listAbilities = useServerFn(adminListAbilityRequests);
  const resolveAbility = useServerFn(adminResolveAbilityRequest);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("reports");
  const [rows, setRows] = useState<Report[]>([]);
  const [abilities, setAbilities] = useState<AbilityReq[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRole({}).then((r) => setAllowed(r.isAdmin || r.isModerator)).catch(() => setAllowed(false));
  }, [fetchRole]);

  const reload = () => {
    setLoading(true);
    if (tab === "reports") {
      list({}).then((r) => setRows(r)).catch((e) => toast.error(String(e?.message ?? e))).finally(() => setLoading(false));
    } else {
      listAbilities({}).then((r) => setAbilities(r as AbilityReq[])).catch((e) => toast.error(String(e?.message ?? e))).finally(() => setLoading(false));
    }
  };
  useEffect(() => { if (allowed) reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [allowed, tab]);

  if (allowed === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <div className="p-6 text-sm">Not authorized. <Link to="/" className="underline">Home</Link></div>;

  const act = async (id: string, status: "resolved" | "dismissed") => {
    try {
      await resolve({ data: { reportId: id, status } });
      toast.success(`Marked ${status}`);
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Moderation inbox</h1>
        <Button variant="ghost" size="sm" onClick={reload}>Refresh</Button>
      </div>

      <div className="flex gap-2 text-xs border-b">
        {([
          { key: "reports", label: "Reports" },
          { key: "abilities", label: "Ability requests" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 -mb-px border-b-2 ${tab === t.key ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {tab === "reports" && (
        <>
          {!loading && rows.length === 0 ? <p className="text-sm text-muted-foreground">No reports.</p> : null}
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase ${r.status === "open" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>{r.status}</span>
                    <span className="font-medium">{r.target_type}</span>{" "}
                    <code className="text-xs text-muted-foreground">{r.target_id}</code>
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                {r.reason ? <p className="mt-1 whitespace-pre-wrap">{r.reason}</p> : null}
                {r.status === "open" ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => act(r.id, "resolved")}>Resolve</Button>
                    <Button size="sm" variant="outline" onClick={() => act(r.id, "dismissed")}>Dismiss</Button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Handled {r.handled_at ? new Date(r.handled_at).toLocaleString() : ""}{r.resolution ? ` · ${r.resolution}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "abilities" && (
        <>
          {!loading && abilities.length === 0 ? <p className="text-sm text-muted-foreground">No ability requests.</p> : null}
          <ul className="space-y-2">
            {abilities.map((r) => (
              <AbilityRow
                key={r.id}
                row={r}
                onResolve={async (status, note) => {
                  try {
                    await resolveAbility({ data: { requestId: r.id, status, adminNote: note || undefined } });
                    toast.success(`Marked ${status}`);
                    reload();
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                }}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AbilityRow({ row, onResolve }: { row: AbilityReq; onResolve: (status: "approved" | "declined", note: string) => void }) {
  const [note, setNote] = useState("");
  const r = row as any;
  return (
    <li className="rounded border p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase ${
            row.status === "pending" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : row.status === "approved" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            : "bg-muted text-muted-foreground"
          }`}>{row.status}</span>
          <span className="font-medium">{r.piece?.name ?? "(piece deleted)"}</span>{" "}
          {r.piece?.slug && (
            <Link to="/pieces/$slug" params={{ slug: r.piece.slug }} className="text-xs underline text-muted-foreground">
              view piece
            </Link>
          )}
          {r.author && (
            <span className="ml-2 text-xs text-muted-foreground">by @{r.author.username}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</div>
      </div>
      <p className="whitespace-pre-wrap">{row.request_text}</p>
      {row.status === "pending" ? (
        <div className="space-y-2">
          <Textarea
            placeholder="Optional note to the author (e.g. 'Approved — coming in v2.', 'Too close to Necromancer.')"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onResolve("approved", note)}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => onResolve("declined", note)}>Decline</Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Reviewed {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : ""}
          {row.admin_note ? ` · ${row.admin_note}` : ""}
        </p>
      )}
    </li>
  );
}
