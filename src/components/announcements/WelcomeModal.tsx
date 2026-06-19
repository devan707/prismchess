import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function WelcomeModal({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const go = (to: "/" | "/forum") => {
    onDismiss();
    navigate({ to });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wide font-semibold">Welcome</span>
          </div>
          <DialogTitle className="font-display">Welcome to Prism Chess</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
          <p>
            You're one of the first people here — thanks for showing up early. Prism Chess is a brand new
            project, and the community is still finding its feet. That's the fun part: what this place
            becomes is going to be shaped by the people who jumped in at the start, including you.
          </p>
          <p>
            Here you can play classic and experimental variants against the AI, design your own pieces
            with custom movement and abilities, build full variants around them, and challenge friends
            to matches with whatever wild rules you cook up.
          </p>
          <p>
            If you make something interesting, share it. If you have an idea, post it in the community
            forum and introduce yourself — we read everything. We're early, and the best things this app
            does next will come from you.
          </p>
          <p className="text-muted-foreground">— The Prism Chess team</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2 flex-col-reverse sm:flex-row">
          <Button variant="ghost" onClick={onDismiss}>Dismiss</Button>
          <Button variant="outline" onClick={() => go("/forum")}>Visit Community</Button>
          <Button onClick={() => go("/")}>Play Now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
