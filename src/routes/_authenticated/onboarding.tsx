import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { completeOnboarding, getMyProfile } from "@/lib/profile.functions";
import { suggestDisplayName, suggestUsername } from "@/lib/chess-names";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Choose your name — Prism Chess" }] }),
  component: OnboardingPage,
});

const AVATAR_OPTIONS = [
  "♚", "♛", "♜", "♝", "♞", "♟",
  "🐉", "🏹", "🔮", "⚔️", "🛡️", "👑",
];

type Step = "name" | "avatar";

function OnboardingPage() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const complete = useServerFn(completeOnboarding);
  const [step, setStep] = useState<Step>("name");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const initial = useMemo(() => suggestUsername(), []);

  useEffect(() => {
    fetchProfile({})
      .then((p) => {
        if (p?.onboarded) {
          navigate({ to: "/", replace: true });
          return;
        }
        const u = initial;
        setUsername(u);
        setDisplayName(suggestDisplayName(u));
        setLoaded(true);
      })
      .catch((e) => {
        toast.error(e.message);
        setLoaded(true);
      });
  }, [fetchProfile, initial, navigate]);

  const reroll = () => {
    const u = suggestUsername();
    setUsername(u);
    setDisplayName(suggestDisplayName(u));
  };

  const goToAvatar = (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.toLowerCase().trim();
    const d = displayName.trim();
    if (!u || !d) {
      toast.error("Please choose a name to continue.");
      return;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(u)) {
      toast.error("Username: 3–24 lowercase letters, numbers, or underscores.");
      return;
    }
    setUsername(u);
    setDisplayName(d);
    setStep("avatar");
  };

  const finish = async (chosenAvatar: string | null) => {
    setBusy(true);
    try {
      await complete({
        data: {
          username: username.toLowerCase().trim(),
          display_name: displayName.trim(),
          avatar: chosenAvatar,
        },
      });
      toast.success(`Welcome, ${displayName.trim()}!`);
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save profile");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="max-w-md w-full mx-auto px-4 py-10 flex-1">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="Prism Chess" width={80} height={80} className="mx-auto h-20 w-20" />
          <h1 className="font-display text-3xl font-bold mt-4">
            {step === "name" ? "Pick your name" : "Pick an avatar"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {step === "name"
              ? "This is how other players will know you. Keep our suggestion, edit it, or shuffle for a new idea."
              : "Optional — choose a symbol to represent you, or skip for now."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
            <span className={cn("h-1.5 w-6 rounded-full", step === "name" ? "bg-primary" : "bg-primary/40")} />
            <span className={cn("h-1.5 w-6 rounded-full", step === "avatar" ? "bg-primary" : "bg-muted")} />
          </div>
        </div>

        {step === "name" ? (
          <form onSubmit={goToAvatar} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="dn">Display name</Label>
                <button
                  type="button"
                  onClick={reroll}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Shuffle className="h-3.5 w-3.5" /> Shuffle
                </button>
              </div>
              <Input
                id="dn"
                value={displayName}
                maxLength={60}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Violet Knight"
              />
            </div>
            <div>
              <Label htmlFor="un">Username</Label>
              <Input
                id="un"
                value={username}
                minLength={3}
                maxLength={24}
                pattern="[a-z0-9_]+"
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="lowercase, numbers, underscores"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used in URLs. Lowercase letters, numbers, and underscores.
              </p>
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div
              role="radiogroup"
              aria-label="Avatar"
              className="grid grid-cols-4 gap-3"
            >
              {AVATAR_OPTIONS.map((a) => {
                const selected = avatar === a;
                return (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAvatar(selected ? null : a)}
                    className={cn(
                      "aspect-square rounded-xl border text-3xl flex items-center justify-center transition-colors",
                      selected
                        ? "border-primary bg-primary/10 ring-2 ring-primary"
                        : "border-border bg-card hover:bg-accent",
                    )}
                  >
                    <span aria-hidden>{a}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="w-full"
                disabled={busy}
                onClick={() => finish(avatar)}
              >
                {busy ? "Saving…" : avatar ? "Finish" : "Continue without avatar"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => setStep("name")}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
