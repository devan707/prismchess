import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, X } from "lucide-react";
import { listMatchMessages, sendMatchMessage } from "@/lib/social.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props { matchId: string; meId: string }
interface Msg { id: string; sender_id: string; body: string; created_at: string }

export function MatchChatPanel({ matchId, meId }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [unread, setUnread] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const fetchList = useServerFn(listMatchMessages);
  const send = useServerFn(sendMatchMessage);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchList({ data: { matchId } }).then((rows) => setMessages(rows as Msg[]));
  }, [matchId]);

  useEffect(() => {
    const ch = supabase
      .channel(`match-chat:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_chat_messages", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
          if (!open && m.sender_id !== meId) setUnread((u) => u + 1);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [matchId, open, meId]);

  useEffect(() => { if (open) { setUnread(0); endRef.current?.scrollIntoView({ behavior: "smooth" }); } }, [open, messages]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const m = await send({ data: { matchId, body } });
      setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m as Msg]));
      setInput("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40">
        {!open ? (
          <Button onClick={() => setOpen(true)} size="icon" className="rounded-full shadow-lg relative">
            <MessageCircle className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full h-5 w-5 flex items-center justify-center">
                {unread}
              </span>
            )}
          </Button>
        ) : (
          <div className="w-[min(92vw,360px)] h-[480px] rounded-xl border bg-card shadow-xl flex flex-col">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="font-display font-semibold text-sm">Match chat</span>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No messages yet. Say good luck 🍀</p>}
              {messages.map((m) => {
                const mine = m.sender_id === meId;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {m.body}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
            <form onSubmit={submit} className="border-t p-2 flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Message…" maxLength={2000} disabled={busy} />
              <Button type="submit" size="icon" disabled={busy || !input.trim()}><Send className="h-4 w-4" /></Button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
