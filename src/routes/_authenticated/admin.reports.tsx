import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/profile.functions";
import { adminListReports, adminResolveReport } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "Admin · Reports — Prism Chess" }] }),
  component: ReportsPage,
});

type Report = Awaited<ReturnType<typeof adminListReports>>[number];

function ReportsPage() {
  const fetchRole = useServerFn(getMyRole);
  const list = useServerFn(adminListReports);
  const resolve = useServerFn(adminResolveReport);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRole({}).then((r) => setAllowed(r.isAdmin || r.isModerator)).catch(() => setAllowed(false));
  }, [fetchRole]);

  const reload = () => {
    setLoading(true);
    list({}).then((r) => setRows(r)).catch((e) => toast.error(String(e?.message ?? e))).finally(() => setLoading(false));
  };
  useEffect(() => { if (allowed) reload(); }, [allowed]);

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
        <h1 className="text-lg font-semibold">Reports inbox</h1>
        <Button variant="ghost" size="sm" onClick={reload}>Refresh</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
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
    </div>
  );
}
