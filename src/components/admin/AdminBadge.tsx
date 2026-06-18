import { Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useServerFn } from "@tanstack/react-start";
import { adminPurgeStaleChallenges } from "@/lib/admin.functions";
import { toast } from "sonner";

/** Red ADMIN chip in the top bar, with a popover of quick admin links. */
export function AdminBadge() {
  const { isAdmin, isModOrAdmin } = useIsAdmin();
  const purge = useServerFn(adminPurgeStaleChallenges);
  if (!isModOrAdmin) return null;

  const onPurge = async () => {
    try {
      const r = await purge({});
      toast.success(`Purged ${r.count} stale challenge${r.count === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purge failed");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400"
        >
          <Shield className="h-3 w-3" />
          <span className="text-xs font-semibold tracking-wide">{isAdmin ? "ADMIN" : "MOD"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <Link to="/admin/reports" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">Reports inbox</Link>
        <Link to="/admin/audit" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">Audit log</Link>
        <Link to="/admin/stats" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">Stats</Link>
        {isAdmin && (
          <Link to="/admin/users" className="block rounded px-2 py-1.5 text-sm hover:bg-accent">Users</Link>
        )}
        <button
          onClick={onPurge}
          className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          Purge stale challenges
        </button>
      </PopoverContent>
    </Popover>
  );
}
