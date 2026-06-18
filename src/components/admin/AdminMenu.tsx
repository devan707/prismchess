import { useState } from "react";
import { Shield, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export type AdminAction = {
  label: string;
  onClick: () => Promise<unknown> | void;
  destructive?: boolean;
  confirm?: string;
};

/**
 * Small admin-only dropdown rendered inline next to user-generated content.
 * Hidden when `show` is false so non-admins see nothing.
 */
export function AdminMenu({ show, label = "Admin", actions }: { show: boolean; label?: string; actions: AdminAction[] }) {
  const [busy, setBusy] = useState(false);
  if (!show || actions.length === 0) return null;

  const run = async (a: AdminAction) => {
    if (a.confirm && !window.confirm(a.confirm)) return;
    setBusy(true);
    try {
      await a.onClick();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Admin action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className="h-7 gap-1 border-red-500/40 bg-red-500/5 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
          onClick={(e) => e.stopPropagation()}
        >
          <Shield className="h-3 w-3" />
          <span className="text-xs">{label}</span>
          <MoreVertical className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">Admin actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {actions.map((a, i) => (
          <DropdownMenuItem
            key={i}
            onSelect={(e) => { e.preventDefault(); void run(a); }}
            className={a.destructive ? "text-red-600 focus:text-red-600 dark:text-red-400" : ""}
          >
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
