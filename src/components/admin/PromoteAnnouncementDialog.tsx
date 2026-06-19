import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  draftPromotionAnnouncement,
  publishPromotionAnnouncement,
} from "@/lib/promotions.functions";

export type PromotionTarget = {
  type: "piece" | "variant";
  id: string;
  slug: string;
  name: string;
};

interface Props {
  target: PromotionTarget | null;
  onClose: () => void;
  onPublished?: (topicId: string) => void;
}

/**
 * After an admin promotes a piece/variant to signature, this dialog asks the
 * admin to review an AI-drafted forum announcement (Featured Showcase). They
 * can publish as-is, edit, or skip — the author is already being notified.
 */
export function PromoteAnnouncementDialog({ target, onClose, onPublished }: Props) {
  const draft = useServerFn(draftPromotionAnnouncement);
  const publish = useServerFn(publishPromotionAnnouncement);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const loadDraft = async (t: PromotionTarget) => {
    setLoading(true);
    try {
      const d = await draft({ data: { targetType: t.type, targetId: t.id } });
      setTitle(d.title);
      setBody(d.body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't draft announcement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (target) {
      setTitle("");
      setBody("");
      void loadDraft(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  if (!target) return null;

  const onPublish = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body required");
      return;
    }
    setPublishing(true);
    try {
      const res = await publish({
        data: { targetType: target.type, targetId: target.id, title: title.trim(), body: body.trim() },
      });
      toast.success("Announcement posted to Featured Showcase");
      onPublished?.(res.topicId);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't publish");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !publishing && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Announce the new signature {target.type}
          </DialogTitle>
          <DialogDescription>
            The creator already got a notification. Post a Featured Showcase forum
            topic so the community sees it too. Edit the AI draft or skip.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Drafting announcement…
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
                Title
              </label>
              <Input
                value={title}
                maxLength={140}
                onChange={(e) => setTitle(e.target.value)}
                disabled={publishing}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
                Body
              </label>
              <Textarea
                value={body}
                maxLength={4000}
                rows={8}
                onChange={(e) => setBody(e.target.value)}
                disabled={publishing}
                className="font-mono text-sm"
              />
              <div className="text-[10px] text-muted-foreground mt-1 text-right">
                {body.length}/4000
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => loadDraft(target)}
              disabled={publishing}
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Regenerate draft
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={publishing}>
            <X className="h-4 w-4 mr-1" /> Skip
          </Button>
          <Button onClick={onPublish} disabled={publishing || loading}>
            <Send className="h-4 w-4 mr-1" />
            {publishing ? "Publishing…" : "Publish announcement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
