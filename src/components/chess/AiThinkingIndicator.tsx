import { useEffect, useState } from "react";
import { PrismGlyph } from "./PrismGlyph";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

interface Props {
  thinking: boolean;
  since: number | null;
  onNudge: () => void;
  /** Seconds before the "Nudge" button appears. */
  stuckAfter?: number;
}

/** Floating indicator shown while the AI is choosing a move.
 *  Appears as a spinning prism after a short delay; offers a "Nudge"
 *  button once it has been stuck for `stuckAfter` seconds. */
export function AiThinkingIndicator({ thinking, since, onNudge, stuckAfter = 15 }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(false);

  // Tick a clock only while thinking so the elapsed counter updates.
  useEffect(() => {
    if (!thinking) { setVisible(false); return; }
    // Only show the badge if thinking lingers past ~600ms — fast moves stay silent.
    const showT = setTimeout(() => setVisible(true), 600);
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => { clearTimeout(showT); clearInterval(i); };
  }, [thinking]);

  if (!thinking || !visible || since == null) return null;
  const elapsed = Math.max(0, Math.floor((now - since) / 1000));
  const stuck = elapsed >= stuckAfter;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border bg-card/95 backdrop-blur px-3 py-2 shadow-lg animate-fade-in"
    >
      <span className="inline-flex h-6 w-6 items-center justify-center animate-spin">
        <PrismGlyph size={0.55} />
      </span>
      <span className="text-xs text-foreground">
        {stuck ? "AI is taking a while…" : "AI is thinking…"}
        <span className="text-muted-foreground ml-1">{elapsed}s</span>
      </span>
      {stuck && (
        <Button size="sm" variant="secondary" onClick={onNudge} className="h-7 px-2 text-xs">
          <Zap className="h-3.5 w-3.5 mr-1" /> Nudge
        </Button>
      )}
    </div>
  );
}
