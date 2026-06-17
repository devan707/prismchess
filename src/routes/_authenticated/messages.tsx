import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listDmThreads } from "@/lib/social.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Messages — Prism Chess" }] }),
  component: MessagesLayout,
});

function MessagesLayout() {
  const fetchThreads = useServerFn(listDmThreads);
  type Thread = Awaited<ReturnType<typeof listDmThreads>>[number];
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try { setThreads(await fetchThreads()); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  // Subscribe to thread updates
  useEffect(() => {
    const ch = supabase
      .channel("dm_threads_list")
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_threads" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between border-b">
        <Link to="/"><Button variant="ghost" size="icon"><Home className="h-4 w-4" /></Button></Link>
        <h1 className="font-display text-lg font-semibold">Messages</h1>
        <div className="w-10" />
      </header>
      <div className="max-w-5xl mx-auto grid md:grid-cols-[280px_1fr] min-h-[calc(100vh-3.5rem)]">
        <aside className="border-r overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : threads.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No conversations yet. Message friends from the <Link to="/friends" className="underline">friends page</Link> or your opponent in a match.
            </p>
          ) : (
            <ul>
              {threads.map((t) => (
                <li key={t.id}>
                  <Link
                    to="/messages/$threadId"
                    params={{ threadId: t.id }}
                    activeProps={{ className: "bg-accent" }}
                    className="flex items-center gap-3 p-3 hover:bg-accent/50 border-b"
                  >
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                      {t.other.avatar ?? t.other.username[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">{t.other.display_name ?? t.other.username}</div>
                        {t.unread > 0 && (
                          <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">{t.unread}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{t.last?.body ?? "No messages yet"}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="min-h-0">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
