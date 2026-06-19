import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pin, MessageSquare } from "lucide-react";

export interface AnnouncementForModal {
  id: string;
  title: string;
  body: string;
  kind: string;
  pinned: boolean;
  cta_label: string | null;
  cta_href: string | null;
  forum_topic_id: string | null;
  published_at: string;
}

export function AnnouncementModal({
  announcement,
  open,
  onDismiss,
}: {
  announcement: AnnouncementForModal;
  open: boolean;
  onDismiss: () => void;
}) {
  const a = announcement;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {a.pinned && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Pin className="h-3 w-3" /> Pinned
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] capitalize">{a.kind}</Badge>
          </div>
          <DialogTitle className="font-display">{a.title}</DialogTitle>
          <DialogDescription className="text-xs">
            {new Date(a.published_at).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {a.body}
        </div>
        <DialogFooter className="gap-2 sm:gap-2 flex-col-reverse sm:flex-row">
          <Button variant="ghost" onClick={onDismiss}>Dismiss</Button>
          {a.forum_topic_id && (
            <Link to="/forum/$topicId" params={{ topicId: a.forum_topic_id }} onClick={onDismiss}>
              <Button variant="outline" className="w-full gap-1">
                <MessageSquare className="h-4 w-4" /> Discuss in forum
              </Button>
            </Link>
          )}
          {a.cta_label && a.cta_href && (
            <a href={a.cta_href} onClick={onDismiss}>
              <Button className="w-full">{a.cta_label}</Button>
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
