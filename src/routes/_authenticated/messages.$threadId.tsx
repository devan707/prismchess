import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { getDmThread, sendDm, markDmRead } from "@/lib/social.functions";
import { supabase } from "@/integrations/supabase/client";
import { ReportDialog } from "@/components/social/ReportDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages/$threadId")({
  component: ThreadPage,
});

interface Message { id: string; sender_id: string; body: string; created_at: string; read_at: string | null }
interface Other { id: string; username: string; display_name: string | null; avatar: string | null }

function ThreadPage() {
  const { threadId } = Route.useParams();
  const fetchThread = useServerFn(getDmThread);
  const send = useServerFn(sendDm);
  const markRead = useServerFn(markDmRead);
  const [meId, setMeId] = useState<string | null>(null);
  const [other, setOther] = useState<Other | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  const load = async () => {
    const res = await fetchThread({ data: { threadId } });
    setOther(res.other ?? null);
    setMessages(res.messages as Message[]);
    markRead({ data: { threadId } }).catch(() => {});
  };
  useEffect(() => { load(); }, [threadId]);

  useEffect(() => {
    const ch = supabase
      .channel(`dm:${threadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
          markRead({ data: { threadId } }).catch(() => {});
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [threadId, markRead]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const m = await send({ data: { threadId, body } });
      setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m as Message]));
      setInput("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="px-4 py-2 border-b flex items-center justify-between gap-2">
        {other ? (
          <Link to="/u/$username" params={{ username: other.username }} className="flex items-center gap-2 min-w-0 hover:underline">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              {other.avatar ?? other.username[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{other.display_name ?? other.username}</div>
              <div className="text-xs text-muted-foreground truncate">@{other.username}</div>
            </div>
          </Link>
        ) : <div />}
        {other && <ReportDialog targetType="user" targetId={other.id} label="" size="icon" />}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Say hi 👋</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="border-t p-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
          disabled={busy}
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
