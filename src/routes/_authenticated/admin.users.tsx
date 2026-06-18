import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/profile.functions";
import {
  adminListUsers, adminSetRole, adminSuspendUser, adminRenameUser,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Admin · Users — Prism Chess" }] }),
  component: UsersPage,
});

type User = Awaited<ReturnType<typeof adminListUsers>>[number];

function UsersPage() {
  const fetchRole = useServerFn(getMyRole);
  const list = useServerFn(adminListUsers);
  const setRole = useServerFn(adminSetRole);
  const suspend = useServerFn(adminSuspendUser);
  const rename = useServerFn(adminRenameUser);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<User[]>([]);

  useEffect(() => {
    fetchRole({}).then((r) => setAllowed(r.isAdmin)).catch(() => setAllowed(false));
  }, [fetchRole]);
  const reload = () => list({ data: { q } }).then(setRows).catch((e) => toast.error(String(e?.message ?? e)));
  useEffect(() => { if (allowed) reload(); }, [allowed]);

  if (allowed === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <div className="p-6 text-sm">Admin only. <Link to="/" className="underline">Home</Link></div>;

  const toggleRole = async (u: User, role: "admin" | "moderator") => {
    const has = u.roles.includes(role);
    if (has && !window.confirm(`Revoke ${role} from @${u.username}?`)) return;
    try {
      await setRole({ data: { userId: u.id, role, grant: !has } });
      toast.success(has ? `Revoked ${role}` : `Granted ${role}`);
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const toggleSuspend = async (u: User) => {
    const isSuspended = u.suspended_until && new Date(u.suspended_until) > new Date();
    if (isSuspended) {
      try { await suspend({ data: { userId: u.id, until: null } }); toast.success("Unsuspended"); reload(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    } else {
      const days = window.prompt("Suspend for how many days?", "7");
      if (!days) return;
      const n = parseInt(days, 10);
      if (!Number.isFinite(n) || n <= 0) return;
      const until = new Date(Date.now() + n * 86400000).toISOString();
      try { await suspend({ data: { userId: u.id, until } }); toast.success("Suspended"); reload(); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    }
  };
  const doRename = async (u: User) => {
    const username = window.prompt("New username (lowercase letters/numbers/underscore):", u.username);
    if (!username) return;
    try { await rename({ data: { userId: u.id, username } }); toast.success("Renamed"); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-3">
      <h1 className="text-lg font-semibold">Users</h1>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search username or display name"
          className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
        />
        <Button size="sm" onClick={reload}>Search</Button>
      </div>
      <div className="rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs">
            <tr>
              <th className="p-2">User</th>
              <th className="p-2">Joined</th>
              <th className="p-2">Roles</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const suspended = u.suspended_until && new Date(u.suspended_until) > new Date();
              return (
                <tr key={u.id} className="border-t align-top">
                  <td className="p-2">
                    <Link to="/u/$username" params={{ username: u.username }} className="font-medium hover:underline">@{u.username}</Link>
                    <div className="text-xs text-muted-foreground">{u.display_name}</div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="p-2 text-xs">{u.roles.length ? u.roles.join(", ") : "—"}</td>
                  <td className="p-2 text-xs">{suspended ? <span className="text-red-600">suspended until {new Date(u.suspended_until!).toLocaleDateString()}</span> : "active"}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => toggleRole(u, "moderator")}>{u.roles.includes("moderator") ? "Revoke mod" : "Make mod"}</Button>
                      <Button size="sm" variant="outline" onClick={() => toggleRole(u, "admin")}>{u.roles.includes("admin") ? "Revoke admin" : "Make admin"}</Button>
                      <Button size="sm" variant="outline" onClick={() => toggleSuspend(u)}>{suspended ? "Unsuspend" : "Suspend"}</Button>
                      <Button size="sm" variant="outline" onClick={() => doRename(u)}>Rename</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
