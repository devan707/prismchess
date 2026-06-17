import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Flag } from "lucide-react";
import { submitReport } from "@/lib/social.functions";
import { toast } from "sonner";

type TargetType = "user" | "dm_message" | "match_message" | "comment" | "game";

interface Props {
  targetType: TargetType;
  targetId: string;
  label?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "icon";
}

export function ReportDialog({ targetType, targetId, label = "Report", variant = "ghost", size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useServerFn(submitReport);

  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await send({ data: { targetType, targetId, reason: reason.trim() } });
      toast.success("Thanks — our team will review this report.");
      setOpen(false);
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className="gap-1">
          <Flag className="h-3 w-3" /> {size !== "icon" && label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Report this {targetType.replace("_", " ")}</DialogTitle></DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What's going on? (Required, up to 500 characters.)"
          maxLength={500}
          rows={4}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !reason.trim()}>Send report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
