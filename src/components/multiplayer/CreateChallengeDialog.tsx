import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Bell, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { createChallenge } from "@/lib/multiplayer.functions";
import { BUILTIN_GAMES, loadSavedGames, type SavedGame } from "@/game/library";
import type { Color, Design } from "@/game/types";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export interface CreateChallengeDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-filled design + name (e.g. the variant the user is currently playing). */
  presetDesign?: { design: Design; name: string } | null;
  /** Default visibility — "link" hides the public-lobby toggle entirely if true. */
  defaultVisibility?: "public" | "link";
  /** Lock visibility to the default. */
  lockVisibility?: boolean;
  onCreated?: () => void;
}

export function CreateChallengeDialog({
  open, onOpenChange, presetDesign, defaultVisibility = "public", lockVisibility, onCreated,
}: CreateChallengeDialogProps) {
  const create = useServerFn(createChallenge);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("builtin:classic-8");
  const [timeControl, setTimeControl] = useState<"2min" | "10min" | "30min" | "3day" | "custom">("10min");
  const [customMinutes, setCustomMinutes] = useState<number>(5);
  const [hostColor, setHostColor] = useState<Color>("w");
  const [visibility, setVisibility] = useState<"public" | "link">(defaultVisibility);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // One-off nudge: if push is available but the user hasn't enabled it yet,
  // offer to turn it on so they get notified when someone joins. Dismissals
  // persist per browser so we don't nag.
  const push = usePushNotifications();
  const NUDGE_KEY = "pc:push-nudge-challenge:dismissed";
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setNudgeDismissed(window.localStorage.getItem(NUDGE_KEY) === "1");
  }, []);
  const showPushNudge =
    !nudgeDismissed &&
    push.supported &&
    !push.isPreview &&
    !push.subscribed &&
    push.permission !== "denied";

  useEffect(() => { if (open) setSaved(loadSavedGames()); }, [open]);
  useEffect(() => { if (open) { setShareUrl(null); setVisibility(defaultVisibility); } }, [open, defaultVisibility]);

  const usingPreset = !!presetDesign;

  const submit = async () => {
    setBusy(true);
    try {
      let design: Design;
      let name: string;
      if (usingPreset) {
        design = presetDesign!.design;
        name = presetDesign!.name;
      } else if (selectedKey.startsWith("builtin:")) {
        const id = selectedKey.slice("builtin:".length);
        const g = BUILTIN_GAMES.find((x) => x.id === id) ?? BUILTIN_GAMES[0];
        design = g.build();
        name = g.name;
      } else {
        const id = selectedKey.slice("saved:".length);
        const s = saved.find((x) => x.id === id);
        if (!s) throw new Error("Saved design not found");
        design = s.design;
        name = s.name;
      }
      const resolvedTc =
        timeControl === "custom"
          ? `${Math.max(1, Math.min(180, Math.floor(customMinutes || 1)))}min`
          : timeControl;
      const res = await create({
        data: {
          design: design as unknown as Record<string, unknown>,
          designName: name,
          timeControl: resolvedTc,
          hostColor,
          visibility,
        },
      });
      const url = `${window.location.origin}/multiplayer/join/${encodeURIComponent(res.shareToken)}`;
      setShareUrl(url);
      onCreated?.();
      if (visibility === "public") toast.success("Challenge posted to lobby");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create challenge");
    } finally {
      setBusy(false);
    }
  };

  const copyShare = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success("Link copied"),
      () => toast.error("Couldn't copy"),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Challenge a friend</DialogTitle>
          <DialogDescription>
            {usingPreset
              ? `Challenge a friend to "${presetDesign!.name}". Share the link or post it to the lobby.`
              : "Pick a design and a time control. Post it to the public lobby or share a private link."}
          </DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="space-y-3">
            <p className="text-sm">Send this link to your opponent:</p>
            <div className="flex gap-2">
              <input readOnly value={shareUrl} className="flex-1 rounded-md border bg-muted/40 px-2 py-1 text-xs" />
              <Button size="sm" onClick={copyShare}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              When they open it they can sign up and accept. The clock won't start until both of you tap Ready.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {showPushNudge && (
              <div className="rounded-md border bg-card/60 px-3 py-2 flex items-start gap-2 text-xs">
                <Bell className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Get pinged when someone joins.</p>
                  <p className="text-muted-foreground">Turn on push so you don&rsquo;t miss it.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={push.busy}
                  onClick={async () => {
                    try { await push.enable(); toast.success("Notifications on"); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't enable"); }
                  }}
                >
                  Enable
                </Button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setNudgeDismissed(true);
                    try { window.localStorage.setItem(NUDGE_KEY, "1"); } catch { /* noop */ }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {!usingPreset && (
              <div>
                <Label>Design</Label>
                <Select value={selectedKey} onValueChange={setSelectedKey}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {saved.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Your saved variants</div>
                        {saved.map((s) => (
                          <SelectItem key={s.id} value={`saved:${s.id}`}>{s.name}</SelectItem>
                        ))}
                        <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-t mt-1">Built-in</div>
                      </>
                    )}
                    {saved.length === 0 && (
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Built-in</div>
                    )}
                    {BUILTIN_GAMES.map((g) => (
                      <SelectItem key={g.id} value={`builtin:${g.id}`}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Time control</Label>
                <Select value={timeControl} onValueChange={(v) => setTimeControl(v as typeof timeControl)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2min">Blitz · 2 min</SelectItem>
                    <SelectItem value="10min">10 min</SelectItem>
                    <SelectItem value="30min">30 min</SelectItem>
                    <SelectItem value="3day">3 days / move</SelectItem>
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {timeControl === "custom" && (
                  <div className="mt-2">
                    <Label className="text-xs text-muted-foreground">Minutes per player</Label>
                    <input
                      type="number" min={1} max={180}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(Number(e.target.value))}
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    />
                  </div>
                )}
              </div>
              <div>
                <Label>Play as</Label>
                <Select value={hostColor} onValueChange={(v) => setHostColor(v as Color)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="w">White</SelectItem>
                    <SelectItem value="b">Black</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as "public" | "link")} disabled={lockVisibility}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public lobby</SelectItem>
                    <SelectItem value="link">Link only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create challenge"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
