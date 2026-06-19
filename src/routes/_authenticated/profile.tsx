import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  getMyProfile, updateMyProfile, updateMyAvatar, updateNotificationPrefs,
} from "@/lib/profile.functions";
import { ArrowLeft, Bell, BellOff } from "lucide-react";
import { PlayPrefsForm } from "@/components/chess/PlayPrefsForm";
import { DEFAULT_PREFS, loadDefaultPrefs, saveDefaultPrefs, type PlayPrefs } from "@/lib/play-prefs";
import { AvatarUploader } from "@/components/AvatarUploader";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { TOS_VERSION, PRIVACY_VERSION } from "@/lib/legal";

const AVATAR_OPTIONS = [
  "♚", "♛", "♜", "♝", "♞", "♟",
  "🐉", "🏹", "🔮", "⚔️", "🛡️", "👑",
];

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Your profile — Prism Chess" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const update = useServerFn(updateMyProfile);
  const updateAvatar = useServerFn(updateMyAvatar);
  const updatePrefsFn = useServerFn(updateNotificationPrefs);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<PlayPrefs>(DEFAULT_PREFS);
  const [emojiAvatar, setEmojiAvatar] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(false);
  const [community, setCommunity] = useState(false);
  const [gameplay, setGameplay] = useState(true);
  const [tosShown, setTosShown] = useState<string | null>(null);
  const push = usePushNotifications();

  useEffect(() => {
    fetchProfile({}).then((p) => {
      if (p) {
        setUsername(p.username);
        setDisplayName(p.display_name ?? p.username);
        setEmojiAvatar(p.avatar ?? null);
        setAvatarUrl(p.avatar_url ?? null);
        setMarketing(!!p.marketing_opt_in);
        setCommunity(!!p.community_updates_opt_in);
        setGameplay(p.gameplay_notify_opt_in !== false);
        setTosShown(p.tos_version ?? null);
      }
    }).catch((e) => toast.error(e.message));
    setPrefs(loadDefaultPrefs());
  }, [fetchProfile]);

  const updatePrefs = (next: PlayPrefs) => { setPrefs(next); saveDefaultPrefs(next); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await update({ data: { username: username.toLowerCase().trim(), display_name: displayName.trim() } });
      toast.success("Profile saved");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const saveEmojiAvatar = async (a: string | null) => {
    setEmojiAvatar(a);
    if (a) setAvatarUrl(null);
    try {
      await updateAvatar({ data: { avatar: a, avatar_url: a ? null : avatarUrl } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save avatar");
    }
  };

  const togglePref = async (
    key: "marketing_opt_in" | "community_updates_opt_in" | "gameplay_notify_opt_in",
    value: boolean,
  ) => {
    if (key === "marketing_opt_in") setMarketing(value);
    if (key === "community_updates_opt_in") setCommunity(value);
    if (key === "gameplay_notify_opt_in") setGameplay(value);
    try {
      await updatePrefsFn({ data: { [key]: value } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-xl mx-auto px-4 pt-6">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Link>
      </header>
      <main className="max-w-xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-bold mb-1">Your profile</h1>
        <p className="text-sm text-muted-foreground mb-6">This is the name people see on the forum.</p>

        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold mb-3">Avatar</h2>
          <AvatarUploader
            value={avatarUrl}
            onUploaded={async ({ path: _path, signedUrl }) => {
              setAvatarUrl(signedUrl);
              setEmojiAvatar(null);
              try { await updateAvatar({ data: { avatar: null, avatar_url: signedUrl } }); }
              catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't save"); }
            }}
            onClear={async () => {
              setAvatarUrl(null);
              try { await updateAvatar({ data: { avatar_url: null } }); }
              catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't save"); }
            }}
          />
          <p className="text-xs uppercase tracking-wide text-muted-foreground mt-4 mb-2">Or pick a symbol</p>
          <div role="radiogroup" aria-label="Avatar symbol" className="grid grid-cols-6 gap-2">
            {AVATAR_OPTIONS.map((a) => {
              const selected = !avatarUrl && emojiAvatar === a;
              return (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => saveEmojiAvatar(selected ? null : a)}
                  className={`aspect-square rounded-lg border text-xl flex items-center justify-center transition-colors ${
                    selected ? "border-primary bg-primary/10 ring-2 ring-primary" : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  <span aria-hidden>{a}</span>
                </button>
              );
            })}
          </div>
        </section>

        <form onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="dn">Display name</Label>
            <Input id="dn" value={displayName} maxLength={60} required onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="un">Username</Label>
            <Input
              id="un"
              value={username}
              required
              minLength={3}
              maxLength={24}
              pattern="[a-z0-9_]+"
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
            />
            <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, and underscores. Must be unique.</p>
          </div>
          <Button type="submit" disabled={busy}>Save profile</Button>
        </form>

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold mb-3">Notifications &amp; email</h2>
          <div className="rounded-lg border bg-card divide-y">
            <label className="flex items-start gap-3 p-3 text-sm">
              <Checkbox checked={gameplay} onCheckedChange={(v) => togglePref("gameplay_notify_opt_in", v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">Gameplay events</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Your move, challenge accepted, friend requests, direct messages.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 p-3 text-sm">
              <Checkbox checked={marketing} onCheckedChange={(v) => togglePref("marketing_opt_in", v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">Prism Chess product updates</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  New features and new signature variants.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 p-3 text-sm">
              <Checkbox checked={community} onCheckedChange={(v) => togglePref("community_updates_opt_in", v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">Periodic community updates</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Forum highlights and popular variants. No fixed schedule.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-4 rounded-lg border bg-card p-3 flex items-center justify-between gap-2">
            <div className="text-sm">
              <div className="font-medium flex items-center gap-2">
                {push.subscribed ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                Browser push notifications
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {push.isPreview
                  ? "Available in the published app only."
                  : !push.supported
                    ? "Not supported on this device."
                    : push.permission === "denied"
                      ? "Blocked by your browser. Enable in browser settings to use."
                      : push.subscribed
                        ? "On — you'll get gameplay alerts you opted into."
                        : "Off — turn on to receive gameplay alerts on this device."}
              </div>
            </div>
            {push.supported && !push.isPreview && push.permission !== "denied" && (
              <Button
                type="button"
                size="sm"
                variant={push.subscribed ? "outline" : "default"}
                disabled={push.busy}
                onClick={async () => {
                  try {
                    if (push.subscribed) { await push.disable(); toast.success("Notifications off"); }
                    else { await push.enable(); toast.success("Notifications on"); }
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
                }}
              >
                {push.busy ? "…" : push.subscribed ? "Turn off" : "Turn on"}
              </Button>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold mb-1">Default game settings</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Used as the starting values when you begin a new game against the computer. You can still change them per game.
          </p>
          <PlayPrefsForm value={prefs} onChange={updatePrefs} />
          <p className="text-[11px] text-muted-foreground mt-2">Saved automatically.</p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold mb-2">Legal</h2>
          <div className="rounded-lg border bg-card p-3 text-sm space-y-1">
            <p>
              <Link to="/terms" className="underline">Terms of Service</Link>
              {" · "}
              <Link to="/privacy" className="underline">Privacy Policy</Link>
            </p>
            <p className="text-xs text-muted-foreground">
              You accepted Terms v{tosShown ?? TOS_VERSION}. Current versions: Terms v{TOS_VERSION}, Privacy v{PRIVACY_VERSION}.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
