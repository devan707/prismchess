import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { ArrowLeft } from "lucide-react";
import { PlayPrefsForm } from "@/components/chess/PlayPrefsForm";
import { DEFAULT_PREFS, loadDefaultPrefs, saveDefaultPrefs, type PlayPrefs } from "@/lib/play-prefs";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Your profile — Prism Chess" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const update = useServerFn(updateMyProfile);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchProfile({}).then((p) => {
      if (p) {
        setUsername(p.username);
        setDisplayName(p.display_name ?? p.username);
      }
    }).catch((e) => toast.error(e.message));
  }, [fetchProfile]);

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
      </main>
    </div>
  );
}
