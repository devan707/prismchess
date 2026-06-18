import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/shell/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cancelMyOpenChallenges } from "@/lib/push.functions";
import {
  User as UserIcon, Users, Mail, MessagesSquare, History, BookOpen,
  Bell, LogOut, LogIn, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/more")({
  head: () => ({
    meta: [
      { title: "More — Prism Chess" },
      { name: "description", content: "Profile, friends, messages, history, and settings." },
    ],
  }),
  component: More,
});

interface RowProps {
  to?: string;
  onClick?: () => void;
  icon: typeof UserIcon;
  label: string;
  hint?: string;
  destructive?: boolean;
}

function Row({ to, onClick, icon: Icon, label, hint, destructive }: RowProps) {
  const inner = (
    <div className={`flex items-center gap-3 p-3 hover:bg-muted/50 transition ${destructive ? "text-destructive" : ""}`}>
      <div className={`h-9 w-9 rounded flex items-center justify-center ${destructive ? "bg-destructive/10" : "bg-secondary"}`}>
        <Icon className={`h-4 w-4 ${destructive ? "text-destructive" : "text-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {!destructive && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
  if (to) return <Link to={to as never}>{inner}</Link>;
  return <button onClick={onClick} className="w-full text-left">{inner}</button>;
}

function More() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cancelOpenFn = useServerFn(cancelMyOpenChallenges);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try { await cancelOpenFn({}); } catch { /* noop */ }
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold px-1">More</h1>

        {email ? (
          <Link to="/profile">
            <Card className="p-4 flex items-center gap-3 hover:border-primary transition">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <UserIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{email}</div>
                <div className="text-xs text-muted-foreground">View profile</div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Card>
          </Link>
        ) : (
          <Link to="/auth">
            <Card className="p-4 flex items-center gap-3 hover:border-primary transition">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <LogIn className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">Sign in</div>
                <div className="text-xs text-muted-foreground">Sync games, play friends, post in the forum</div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Card>
          </Link>
        )}

        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Social</h2>
          <Card className="divide-y">
            <Row to="/friends" icon={Users} label="Friends" />
            <Row to="/messages" icon={Mail} label="Messages" />
            <Row to="/forum" icon={MessagesSquare} label="Community forum" />
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Activity</h2>
          <Card className="divide-y">
            <Row to="/history" icon={History} label="Game history" />
            <Row to="/multiplayer" icon={Users} label="Multiplayer lobby" />
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Settings</h2>
          <Card className="divide-y">
            <Row to="/profile" icon={Bell} label="Notifications & profile" hint="Manage push notifications" />
            <Row to="/help" icon={BookOpen} label="Help & support" />
          </Card>
        </section>

        {email && (
          <section>
            <Card>
              <Row onClick={signOut} icon={LogOut} label="Sign out" destructive />
            </Card>
          </section>
        )}
      </div>
    </AppShell>
  );
}
