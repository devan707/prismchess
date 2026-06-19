import { useEffect, useState, useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from "@/lib/notifications.functions";

/**
 * Topbar bell that opens an inbox popover. Polls every 60s while mounted so
 * "next time the user opens the app" notifications surface quickly without a
 * full realtime subscription.
 */
export function NotificationsBell() {
  const router = useRouter();
  const fetchList = useServerFn(listMyNotifications);
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);

  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchList({});
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      // ignore — bell is a passive surface
    }
  }, [fetchList]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Refresh when opened to catch immediate updates.
  useEffect(() => { if (open) void load(); }, [open, load]);

  const onItemClick = async (n: Notification) => {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      setUnread((u) => Math.max(u - 1, 0));
      try { await markOne({ data: { id: n.id } }); } catch { /* noop */ }
    }
    setOpen(false);
  };

  const onMarkAll = async () => {
    setItems((prev) => prev.map((x) => x.read_at ? x : { ...x, read_at: new Date().toISOString() }));
    setUnread(0);
    try { await markAll({}); } catch { /* noop */ }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
          className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent text-foreground/80 hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">Inbox</span>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={onMarkAll} className="h-7 text-xs">
              <Check className="h-3 w-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const inner = (
                  <div className={`flex gap-2 px-3 py-2.5 ${!n.read_at ? "bg-primary/5" : ""}`}>
                    {!n.read_at && (
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-hidden />
                    )}
                    <div className={`flex-1 min-w-0 ${!n.read_at ? "" : "pl-3"}`}>
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void onItemClick(n);
                        if (n.link) router.navigate({ to: n.link as never });
                      }}
                      className="block w-full text-left hover:bg-accent/50 transition-colors"
                    >
                      {inner}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
