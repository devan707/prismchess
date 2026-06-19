import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Bell, BellOff, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  completeOnboarding, getMyProfile, isUsernameAvailable,
} from "@/lib/profile.functions";
import { suggestDisplayName, suggestUsername } from "@/lib/chess-names";
import { isReservedUsername, TOS_VERSION, PRIVACY_VERSION } from "@/lib/legal";
import { AvatarUploader } from "@/components/AvatarUploader";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Welcome — Prism Chess" }] }),
  component: OnboardingPage,
});

const AVATAR_OPTIONS = [
  "♚", "♛", "♜", "♝", "♞", "♟",
  "🐉", "🏹", "🔮", "⚔️", "🛡️", "👑",
];

type Step = "consent" | "name" | "avatar" | "notify";
const STEPS: Step[] = ["consent", "name", "avatar", "notify"];

function OnboardingPage() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const checkUsername = useServerFn(isUsernameAvailable);
  const complete = useServerFn(completeOnboarding);

  const [step, setStep] = useState<Step>("consent");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Consent
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [community, setCommunity] = useState(false);
  const [gameplay, setGameplay] = useState(true);

  // Identity
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [unameStatus, setUnameStatus] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");

  // Avatar
  const [emojiAvatar, setEmojiAvatar] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  const push = usePushNotifications();

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

  // Live username availability check (debounced) once user reaches name step.
  useEffect(() => {
    if (step !== "name") return;
    const u = username.toLowerCase().trim();
    if (!/^[a-z0-9_]{3,24}$/.test(u)) { setUnameStatus("invalid"); return; }
    if (isReservedUsername(u)) { setUnameStatus("taken"); return; }
    setUnameStatus("checking");
    const t = setTimeout(() => {
      checkUsername({ data: { username: u } })
        .then((r) => setUnameStatus(r.available ? "ok" : "taken"))
        .catch(() => setUnameStatus("idle"));
    }, 400);
    return () => clearTimeout(t);
  }, [username, step, checkUsername]);

  const reroll = () => {
    const u = suggestUsername();
    setUsername(u);
    setDisplayName(suggestDisplayName(u));
  };

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };
  const goPrev = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const onConsentNext = () => {
    if (!agree) {
      toast.error("Please accept the Terms and Privacy Policy to continue.");
      return;
    }
    goNext();
  };

  const onNameNext = (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.toLowerCase().trim();
    const d = displayName.trim();
    if (!u || !d) { toast.error("Please choose a name to continue."); return; }
    if (!/^[a-z0-9_]{3,24}$/.test(u)) {
      toast.error("Username: 3–24 lowercase letters, numbers, or underscores.");
      return;
    }
    if (isReservedUsername(u)) { toast.error("That username isn't available."); return; }
    if (unameStatus === "taken") { toast.error("That username is taken."); return; }
    setUsername(u); setDisplayName(d);
    goNext();
  };

  const onAvatarNext = () => goNext();

  const finish = async () => {
    setBusy(true);
    try {
      await complete({
        data: {
          username: username.toLowerCase().trim(),
          display_name: displayName.trim(),
          avatar: emojiAvatar,
          avatar_url: uploadedUrl,
          age_confirmed: true,
          tos_version: TOS_VERSION,
          privacy_version: PRIVACY_VERSION,
          marketing_opt_in: marketing,
          community_updates_opt_in: community,
          gameplay_notify_opt_in: gameplay,
        },
      });
      toast.success(`Welcome, ${displayName.trim()}!`);
      const sp = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
      const redirect = sp.get("redirect");
      if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
        window.location.assign(redirect);
        return;
      }
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

  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="max-w-md w-full mx-auto px-4 py-8 flex-1">
        <div className="text-center mb-6">
          <img src={logoUrl} alt="Prism Chess" width={64} height={64} className="mx-auto h-16 w-16" />
          <h1 className="font-display text-2xl font-bold mt-3">
            {step === "consent" && "Welcome to Prism Chess"}
            {step === "name" && "Pick your name"}
            {step === "avatar" && "Pick an avatar"}
            {step === "notify" && "Stay in the loop"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {step === "consent" && "A couple of quick agreements before we set up your profile."}
            {step === "name" && "This is how other players will know you. Keep our suggestion, edit it, or shuffle."}
            {step === "avatar" && "Upload a photo, pick a symbol, or skip."}
            {step === "notify" && "Optional — turn on push so we can tell you when it's your move."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1.5 w-6 rounded-full",
                  i < stepIdx ? "bg-primary/60" : i === stepIdx ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>

        {step === "consent" && (
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm">
              <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">Required.</span>{" "}
                I&rsquo;m 13 or older and agree to the{" "}
                <Link to="/terms" className="underline" target="_blank" rel="noreferrer">Terms</Link> and{" "}
                <Link to="/privacy" className="underline" target="_blank" rel="noreferrer">Privacy Policy</Link>.
              </span>
            </label>

            <div className="rounded-lg border bg-card divide-y">
              <label className="flex items-start gap-3 p-3 text-sm">
                <Checkbox checked={marketing} onCheckedChange={(v) => setMarketing(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium">Email me about Prism Chess updates.</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    New features, new signature variants, the occasional product news. Unsubscribe anytime.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 p-3 text-sm">
                <Checkbox checked={community} onCheckedChange={(v) => setCommunity(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium">Send me periodic community updates.</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Forum highlights, popular variants, and what people are creating. No fixed schedule.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 p-3 text-sm">
                <Checkbox checked={gameplay} onCheckedChange={(v) => setGameplay(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium">Let me know about gameplay events.</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Your move, challenge accepted, friend requests, and direct messages. Browser permission asked
                    separately.
                  </span>
                </span>
              </label>
            </div>

            <Button onClick={onConsentNext} className="w-full" disabled={!agree}>
              Continue
            </Button>
          </div>
        )}

        {step === "name" && (
          <form onSubmit={onNameNext} className="space-y-4">
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
                aria-invalid={unameStatus === "taken" || unameStatus === "invalid"}
              />
              <p className="text-xs mt-1 min-h-[1em]">
                {unameStatus === "checking" && <span className="text-muted-foreground">Checking…</span>}
                {unameStatus === "ok" && <span className="text-primary">✓ Available</span>}
                {unameStatus === "taken" && <span className="text-destructive">That username isn&rsquo;t available.</span>}
                {unameStatus === "invalid" && <span className="text-muted-foreground">3–24 lowercase letters, numbers, or underscores.</span>}
                {unameStatus === "idle" && <span className="text-muted-foreground">Used in URLs.</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={goPrev} className="flex-1">Back</Button>
              <Button type="submit" className="flex-1" disabled={unameStatus === "taken" || unameStatus === "invalid"}>
                Continue
              </Button>
            </div>
          </form>
        )}

        {step === "avatar" && (
          <div className="space-y-6">
            <AvatarUploader
              value={uploadedUrl}
              previousPath={uploadedPath}
              onUploaded={({ path, signedUrl }) => {
                setUploadedPath(path);
                setUploadedUrl(signedUrl);
                setEmojiAvatar(null);
              }}
              onClear={() => { setUploadedUrl(null); setUploadedPath(null); }}
            />

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Or pick a symbol</p>
              <div role="radiogroup" aria-label="Avatar symbol" className="grid grid-cols-6 gap-2">
                {AVATAR_OPTIONS.map((a) => {
                  const selected = !uploadedUrl && emojiAvatar === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setEmojiAvatar(selected ? null : a);
                        if (!selected) { setUploadedUrl(null); setUploadedPath(null); }
                      }}
                      className={cn(
                        "aspect-square rounded-lg border text-2xl flex items-center justify-center transition-colors",
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
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={goPrev} className="flex-1">Back</Button>
              <Button type="button" className="flex-1" onClick={onAvatarNext}>
                {uploadedUrl || emojiAvatar ? "Continue" : "Skip for now"}
              </Button>
            </div>
          </div>
        )}

        {step === "notify" && (
          <div className="space-y-4">
            {!push.supported || push.isPreview ? (
              <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Push notifications aren&rsquo;t available here. You can turn them on later from the published app.
              </div>
            ) : push.subscribed ? (
              <div className="rounded-lg border bg-card p-4 text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Notifications are on. You can change this anytime in Settings.
              </div>
            ) : push.permission === "denied" ? (
              <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Your browser has blocked notifications for this site. You can re-enable them in your browser
                settings and turn them on later from Settings.
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-start gap-2 text-sm">
                  <Bell className="h-4 w-4 text-primary mt-0.5" />
                  <p>
                    Turn on push to know when it&rsquo;s your move, when someone accepts your challenge,
                    or when a friend messages you. Only used for events you opted into.
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={push.busy}
                  onClick={async () => {
                    try { await push.enable(); toast.success("Notifications enabled"); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't enable"); }
                  }}
                >
                  {push.busy ? "Asking your browser…" : "Turn on notifications"}
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={goPrev} className="flex-1" disabled={busy}>Back</Button>
              <Button type="button" className="flex-1" disabled={busy} onClick={finish}>
                {busy ? "Saving…" : push.subscribed ? "Finish" : "Skip & finish"}
              </Button>
            </div>
            {!push.subscribed && push.supported && !push.isPreview && (
              <p className="text-[11px] text-center text-muted-foreground inline-flex items-center justify-center gap-1 w-full">
                <BellOff className="h-3 w-3" /> You can turn notifications on later.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
