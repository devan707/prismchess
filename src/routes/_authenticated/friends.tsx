import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Home, Check, X, Trash2, MessageCircle, ShieldOff, ShieldAlert } from "lucide-react";
import {
  listFriends, respondFriendRequest, removeFriend,
  listBlocks, unblockUser, openOrCreateDmThread,
} from "@/lib/social.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({ meta: [{ title: "Friends — Prism Chess" }] }),
  component: FriendsPage,
});

function FriendsPage() {
  const navigate = useNavigate();
  const fetchFriends = useServerFn(listFriends);
  const fetchBlocks = useServerFn(listBlocks);
  const respond = useServerFn(respondFriendRequest);
  const remove = useServerFn(removeFriend);
  const unblock = useServerFn(unblockUser);
  const openDm = useServerFn(openOrCreateDmThread);

  type Friend = Awaited<ReturnType<typeof listFriends>>[number];
  type Block = Awaited<ReturnType<typeof listBlocks>>[number];
  const [rows, setRows] = useState<Friend[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [f, b] = await Promise.all([fetchFriends(), fetchBlocks()]);
      setRows(f); setBlocks(b);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const incoming = rows.filter((r) => r.incoming);
  const outgoing = rows.filter((r) => r.outgoing);
  const accepted = rows.filter((r) => r.status === "accepted");

  const handleRespond = async (id: string, accept: boolean) => {
    try { await respond({ data: { friendshipId: id, accept } }); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const handleRemove = async (otherId: string) => {
    try { await remove({ data: { otherId } }); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const handleUnblock = async (otherId: string) => {
    try { await unblock({ data: { targetId: otherId } }); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const handleMessage = async (otherId: string) => {
    try {
      const { threadId } = await openDm({ data: { otherId } });
      navigate({ to: "/messages/$threadId", params: { threadId } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between border-b">
        <Link to="/"><Button variant="ghost" size="icon"><Home className="h-4 w-4" /></Button></Link>
        <h1 className="font-display text-lg font-semibold">Friends</h1>
        <div className="w-10" />
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {incoming.length > 0 && (
              <section>
                <h2 className="font-display font-semibold mb-2">Friend requests</h2>
                <ul className="space-y-2">
                  {incoming.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                      <UserRow user={r.other} />
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => handleRespond(r.id, true)}><Check className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRespond(r.id, false)}><X className="h-3 w-3" /></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="font-display font-semibold mb-2">Friends ({accepted.length})</h2>
              {accepted.length === 0 ? (
                <p className="text-sm text-muted-foreground">No friends yet. Find players in the multiplayer lobby or community.</p>
              ) : (
                <ul className="space-y-2">
                  {accepted.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                      <UserRow user={r.other} />
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleMessage(r.other.id)}>
                          <MessageCircle className="h-3 w-3 mr-1" /> Message
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRemove(r.other.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {outgoing.length > 0 && (
              <section>
                <h2 className="font-display font-semibold mb-2">Pending sent</h2>
                <ul className="space-y-2">
                  {outgoing.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                      <UserRow user={r.other} />
                      <Button size="sm" variant="ghost" onClick={() => handleRespond(r.id, false)}>Cancel</Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {blocks.length > 0 && (
              <section>
                <h2 className="font-display font-semibold mb-2 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" /> Blocked
                </h2>
                <ul className="space-y-2">
                  {blocks.map((b) => (
                    <li key={b.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                      <UserRow user={b} />
                      <Button size="sm" variant="ghost" onClick={() => handleUnblock(b.id)}>
                        <ShieldOff className="h-3 w-3 mr-1" /> Unblock
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function UserRow({ user }: { user: { username: string; display_name: string | null; avatar: string | null } }) {
  return (
    <Link
      to="/u/$username"
      params={{ username: user.username }}
      className="flex items-center gap-3 min-w-0 hover:underline"
    >
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-base">
        {user.avatar ?? user.username[0]?.toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="font-medium truncate">{user.display_name ?? user.username}</div>
        <div className="text-xs text-muted-foreground truncate">@{user.username}</div>
      </div>
    </Link>
  );
}
