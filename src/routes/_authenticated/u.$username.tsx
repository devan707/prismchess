import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Home, UserPlus, UserCheck, UserX, MessageCircle, Shield, Heart, MessageSquare } from "lucide-react";
import {
  getPublicProfile, getFriendshipWith, sendFriendRequest, respondFriendRequest, removeFriend,
  blockUser, openOrCreateDmThread,
} from "@/lib/social.functions";
import { ReportDialog } from "@/components/social/ReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/u/$username")({
  head: () => ({ meta: [{ title: "Profile — Prism Chess" }] }),
  component: UserProfilePage,
});

function UserProfilePage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getPublicProfile);
  const fetchFriendship = useServerFn(getFriendshipWith);
  const reqFriend = useServerFn(sendFriendRequest);
  const respond = useServerFn(respondFriendRequest);
  const unfriend = useServerFn(removeFriend);
  const block = useServerFn(blockUser);
  const openDm = useServerFn(openOrCreateDmThread);

  type Data = Awaited<ReturnType<typeof getPublicProfile>>;
  const [data, setData] = useState<Data>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [friendship, setFriendship] = useState<{ id: string; status: string; requested_by: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMeId(u.user?.id ?? null);
    const p = await fetchProfile({ data: { username } });
    setData(p);
    if (p && u.user && p.profile.id !== u.user.id) {
      const f = await fetchFriendship({ data: { otherId: p.profile.id } });
      setFriendship(f ?? null);
    }
    setLoading(false);
  };
  useEffect(() => { refresh(); }, [username]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">User not found.</div>;

  const { profile, games } = data;
  const isSelf = meId === profile.id;

  const friendAction = async () => {
    try {
      if (!friendship) await reqFriend({ data: { targetId: profile.id } });
      else if (friendship.status === "accepted") await unfriend({ data: { otherId: profile.id } });
      else if (friendship.requested_by === meId) await respond({ data: { friendshipId: friendship.id, accept: false } });
      else await respond({ data: { friendshipId: friendship.id, accept: true } });
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const messageAction = async () => {
    try {
      const { threadId } = await openDm({ data: { otherId: profile.id } });
      navigate({ to: "/messages/$threadId", params: { threadId } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "You can only DM friends or your current opponent."); }
  };

  const blockAction = async () => {
    if (!confirm(`Block @${profile.username}?`)) return;
    try { await block({ data: { targetId: profile.id } }); toast.success("Blocked"); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  let friendLabel = "Add friend"; let FriendIcon = UserPlus;
  if (friendship?.status === "accepted") { friendLabel = "Friends"; FriendIcon = UserCheck; }
  else if (friendship && friendship.requested_by === meId) { friendLabel = "Cancel request"; FriendIcon = UserX; }
  else if (friendship) { friendLabel = "Accept request"; FriendIcon = UserCheck; }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between border-b">
        <Link to="/"><Button variant="ghost" size="icon"><Home className="h-4 w-4" /></Button></Link>
        <h1 className="font-display text-lg font-semibold truncate">@{profile.username}</h1>
        <div className="w-10" />
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-2xl">
            {profile.avatar ?? profile.username[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl font-semibold truncate">{profile.display_name ?? profile.username}</div>
            <div className="text-xs text-muted-foreground">Joined {new Date(profile.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        {!isSelf && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={friendAction}><FriendIcon className="h-3 w-3 mr-1" /> {friendLabel}</Button>
            <Button size="sm" variant="outline" onClick={messageAction}><MessageCircle className="h-3 w-3 mr-1" /> Message</Button>
            <Button size="sm" variant="ghost" onClick={blockAction}><Shield className="h-3 w-3 mr-1" /> Block</Button>
            <ReportDialog targetType="user" targetId={profile.id} />
          </div>
        )}

        <section>
          <h2 className="font-display font-semibold mb-2">Published games ({games.length})</h2>
          {games.length === 0 ? (
            <p className="text-sm text-muted-foreground">No games published yet.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {games.map((g) => (
                <li key={g.id}>
                  <Link to="/g/$slug" params={{ slug: g.slug }} className="block rounded-lg border bg-card p-3 hover:border-primary transition">
                    <div className="font-medium truncate">{g.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{g.description}</div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {g.like_count}</span>
                      <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {g.comment_count}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
