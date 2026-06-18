import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/profile.functions";
import { adminGetStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/stats")({
  head: () => ({ meta: [{ title: "Admin · Stats — Prism Chess" }] }),
  component: StatsPage,
});

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StatsPage() {
  const fetchRole = useServerFn(getMyRole);
  const fetchStats = useServerFn(adminGetStats);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [s, setS] = useState<Awaited<ReturnType<typeof adminGetStats>> | null>(null);

  useEffect(() => {
    fetchRole({}).then((r) => setAllowed(r.isAdmin || r.isModerator)).catch(() => setAllowed(false));
  }, [fetchRole]);
  useEffect(() => { if (allowed) fetchStats({}).then(setS).catch(() => {}); }, [allowed]);

  if (allowed === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <div className="p-6 text-sm">Not authorized. <Link to="/" className="underline">Home</Link></div>;
  if (!s) return <div className="p-6 text-sm text-muted-foreground">Loading stats…</div>;

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-4">
      <h1 className="text-lg font-semibold">Stats</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Users" value={s.users} />
        <Stat label="Signups (7d)" value={s.signups7} />
        <Stat label="Active matches" value={s.activeMatches} />
        <Stat label="Finished (7d)" value={s.finished7} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Top variants</h2>
          <ul className="space-y-1 text-sm">
            {s.topVariants.map((v: any) => (
              <li key={v.variant_key} className="flex justify-between"><span className="truncate">{v.variant_key}</span><span className="tabular-nums text-muted-foreground">{v.plays}</span></li>
            ))}
          </ul>
        </div>
        <div className="rounded border p-3">
          <h2 className="mb-2 text-sm font-semibold">Top custom pieces</h2>
          <ul className="space-y-1 text-sm">
            {s.topPieces.map((p: any) => (
              <li key={p.id} className="flex justify-between"><span className="truncate">{p.name}</span><span className="tabular-nums text-muted-foreground">♥ {p.like_count}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
