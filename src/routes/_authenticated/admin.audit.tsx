import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/profile.functions";
import { adminListAuditLog } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Admin · Audit log — Prism Chess" }] }),
  component: AuditPage,
});

type Row = Awaited<ReturnType<typeof adminListAuditLog>>[number];

function AuditPage() {
  const fetchRole = useServerFn(getMyRole);
  const list = useServerFn(adminListAuditLog);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    fetchRole({}).then((r) => setAllowed(r.isAdmin || r.isModerator)).catch(() => setAllowed(false));
  }, [fetchRole]);
  useEffect(() => { if (allowed) list({ data: { limit: 200 } }).then(setRows).catch(() => {}); }, [allowed]);

  if (allowed === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <div className="p-6 text-sm">Not authorized. <Link to="/" className="underline">Home</Link></div>;

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-3">
      <h1 className="text-lg font-semibold">Admin audit log</h1>
      <div className="rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2">When</th>
              <th className="p-2">Actor</th>
              <th className="p-2">Action</th>
              <th className="p-2">Target</th>
              <th className="p-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2 font-mono">{r.actor_id?.slice(0, 8) ?? "—"}</td>
                <td className="p-2">{r.action}</td>
                <td className="p-2">{r.target_type} <code className="text-muted-foreground">{r.target_id ?? ""}</code></td>
                <td className="p-2 font-mono text-[10px]">{JSON.stringify(r.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
