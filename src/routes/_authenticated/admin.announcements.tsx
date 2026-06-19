import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listAllAnnouncementsAdmin,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  togglePinned,
  toggleActive,
} from "@/lib/announcements.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Pin, Plus, Trash2, MessageSquare, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/announcements")({
  component: AnnouncementsAdmin,
});

type Row = Awaited<ReturnType<typeof listAllAnnouncementsAdmin>>[number];

const KINDS = ["welcome", "update", "feature", "variant", "spotlight", "challenge", "general"] as const;

interface FormState {
  id?: string;
  title: string;
  body: string;
  kind: (typeof KINDS)[number];
  ctaLabel: string;
  ctaHref: string;
  pinned: boolean;
  active: boolean;
  syncForumThread: boolean;
}

const emptyForm: FormState = {
  title: "",
  body: "",
  kind: "update",
  ctaLabel: "",
  ctaHref: "",
  pinned: false,
  active: true,
  syncForumThread: true,
};

function AnnouncementsAdmin() {
  const list = useServerFn(listAllAnnouncementsAdmin);
  const create = useServerFn(createAnnouncement);
  const update = useServerFn(updateAnnouncement);
  const del = useServerFn(deleteAnnouncement);
  const setPin = useServerFn(togglePinned);
  const setActive = useServerFn(toggleActive);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () =>
    list({})
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (r: Row) => {
    setForm({
      id: r.id,
      title: r.title,
      body: r.body,
      kind: (r.kind as FormState["kind"]) ?? "general",
      ctaLabel: r.cta_label ?? "",
      ctaHref: r.cta_href ?? "",
      pinned: r.pinned,
      active: r.active,
      syncForumThread: true,
    });
    setOpen(true);
  };

  const save = async () => {
    if (form.title.trim().length < 3) { toast.error("Title is too short."); return; }
    if (form.body.trim().length < 1) { toast.error("Body is required."); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        kind: form.kind,
        ctaLabel: form.ctaLabel.trim() || null,
        ctaHref: form.ctaHref.trim() || null,
        pinned: form.pinned,
        active: form.active,
        syncForumThread: form.syncForumThread,
      };
      if (form.id) {
        await update({ data: { id: form.id, ...payload } });
        toast.success("Announcement updated");
      } else {
        await create({ data: payload });
        toast.success("Announcement created");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-4xl mx-auto px-4 pt-6 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Home
        </Link>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New announcement</Button>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="font-display text-3xl font-bold">Announcements</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Shown as modals to signed-in users. Each can optionally mirror to a forum thread for permanent reference.
        </p>

        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No announcements yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {r.pinned && <Badge variant="secondary" className="gap-1 text-[10px]"><Pin className="h-3 w-3" /> Pinned</Badge>}
                      <Badge variant={r.active ? "default" : "outline"} className="text-[10px]">
                        {r.active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{r.kind}</Badge>
                      {r.forum_topic_id && (
                        <Link
                          to="/forum/$topicId"
                          params={{ topicId: r.forum_topic_id }}
                          className="text-[10px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <MessageSquare className="h-3 w-3" /> Thread
                        </Link>
                      )}
                    </div>
                    <h2 className="font-display font-semibold">{r.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.body}</p>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {new Date(r.published_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => { await setPin({ data: { id: r.id, pinned: !r.pinned } }); load(); }}
                    >
                      {r.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => { await setActive({ data: { id: r.id, active: !r.active } }); load(); }}
                    >
                      {r.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={async () => {
                        if (!confirm(`Delete "${r.title}"?`)) return;
                        await del({ data: { id: r.id } });
                        load();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit announcement" : "New announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ann-title">Title</Label>
              <Input id="ann-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ann-body">Body</Label>
              <Textarea
                id="ann-body"
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Kind</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as FormState["kind"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ann-cta-label">CTA label (optional)</Label>
                <Input
                  id="ann-cta-label"
                  value={form.ctaLabel}
                  onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
                  placeholder="e.g. Try it now"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ann-cta-href">CTA link (optional)</Label>
              <Input
                id="ann-cta-href"
                value={form.ctaHref}
                onChange={(e) => setForm({ ...form, ctaHref: e.target.value })}
                placeholder="/pieces or https://…"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Pinned</Label>
                <p className="text-xs text-muted-foreground">Shown first; surfaces ahead of others.</p>
              </div>
              <Switch checked={form.pinned} onCheckedChange={(v) => setForm({ ...form, pinned: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive announcements aren't shown to users.</p>
              </div>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Also {form.id ? "update" : "post"} forum thread</Label>
                <p className="text-xs text-muted-foreground">Mirrors this announcement into the community forum.</p>
              </div>
              <Switch checked={form.syncForumThread} onCheckedChange={(v) => setForm({ ...form, syncForumThread: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Publish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
