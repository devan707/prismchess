import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import logoUrl from "@/assets/logo.png";
import { ArrowLeft } from "lucide-react";
import { safeRedirectFromSearch, withRedirect } from "@/lib/redirect-after-auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Prism Chess" },
      { name: "description", content: "Sign in or create an account to join the Prism Chess community." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [redirectTo] = useState<string | null>(() => safeRedirectFromSearch());

  const goAfterSignIn = () => {
    if (redirectTo) {
      window.location.assign(redirectTo);
      return;
    }
    navigate({ to: "/", replace: true });
  };
  const goAfterSignUp = () => {
    navigate({ to: "/onboarding", search: redirectTo ? { redirect: redirectTo } : undefined });
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) goAfterSignIn();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    goAfterSignIn();
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("Please accept the Terms and Privacy Policy to continue.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + withRedirect("/", redirectTo) },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created! Let's finish setting up.");
    goAfterSignUp();
  };

  const google = async () => {
    if (tab === "signup" && !agreed) {
      toast.error("Please accept the Terms and Privacy Policy to continue.");
      return;
    }
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + (redirectTo ?? "/"),
    });
    if (result.error) {
      setBusy(false);
      toast.error(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    goAfterSignIn();
  };

  const consentRow = (idSuffix: string) => (
    <label htmlFor={`agree-${idSuffix}`} className="flex items-start gap-2 text-xs leading-relaxed">
      <Checkbox
        id={`agree-${idSuffix}`}
        checked={agreed}
        onCheckedChange={(v) => setAgreed(v === true)}
        className="mt-0.5"
      />
      <span className="text-muted-foreground">
        I&rsquo;m 13 or older and agree to the{" "}
        <Link to="/terms" className="underline text-foreground">Terms</Link>
        {" "}and{" "}
        <Link to="/privacy" className="underline text-foreground">Privacy Policy</Link>.
      </span>
    </label>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="max-w-md w-full mx-auto px-4 pt-6">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Link>
      </header>
      <main className="max-w-md w-full mx-auto px-4 py-8 flex-1">
        <div className="text-center mb-6">
          <img src={logoUrl} alt="Prism Chess" width={96} height={96} className="mx-auto h-24 w-24" />
          <h1 className="font-display text-3xl font-bold mt-3">Prism Chess</h1>
          <p className="text-sm text-muted-foreground mt-1">Join the community to play, create, and share.</p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={signIn} className="space-y-3 mt-4">
              <div>
                <Label htmlFor="email-i">Email</Label>
                <Input id="email-i" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pw-i">Password</Label>
                <Input id="pw-i" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>Sign in</Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={signUp} className="space-y-3 mt-4">
              <div>
                <Label htmlFor="email-u">Email</Label>
                <Input id="email-u" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pw-u">Password</Label>
                <Input id="pw-u" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">At least 8 characters. We check against leaked-password lists.</p>
              </div>
              {consentRow("u")}
              <Button type="submit" className="w-full" disabled={busy || !agreed}>Create account</Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" onClick={google} disabled={busy || (tab === "signup" && !agreed)}>
          Continue with Google
        </Button>

        {tab === "signup" && (
          <p className="mt-3 text-[11px] text-center text-muted-foreground">
            By continuing with Google you also agree to our{" "}
            <Link to="/terms" className="underline">Terms</Link> and{" "}
            <Link to="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        )}

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          <Link to="/terms" className="underline">Terms</Link>
          {" · "}
          <Link to="/privacy" className="underline">Privacy</Link>
        </p>
      </main>
    </div>
  );
}
