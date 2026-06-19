import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KIND = z.enum([
  "welcome",
  "update",
  "feature",
  "variant",
  "spotlight",
  "challenge",
  "general",
]);

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("admin") && !roles.includes("moderator")) {
    throw new Error("Admins only.");
  }
}

export const listActiveAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("announcements")
      .select("id, title, body, cta_label, cta_href, kind, pinned, active, forum_topic_id, published_at")
      .eq("active", true)
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: reads } = await context.supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("user_id", context.userId);
    const readSet = new Set((reads ?? []).map((r: any) => r.announcement_id));
    return (data ?? []).map((a: any) => ({ ...a, read: readSet.has(a.id) }));
  });

export const getNextUnseenAnnouncement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile }, { data: anns }, { data: reads }] = await Promise.all([
      context.supabase.rpc("get_my_profile") as unknown as Promise<{ data: { welcomed_at: string | null } | null }>,
      context.supabase
        .from("announcements")
        .select("id, title, body, cta_label, cta_href, kind, pinned, forum_topic_id, published_at")
        .eq("active", true)
        .order("pinned", { ascending: false })
        .order("published_at", { ascending: false }),
      context.supabase.from("announcement_reads").select("announcement_id").eq("user_id", context.userId),
    ]);
    const readSet = new Set((reads ?? []).map((r: any) => r.announcement_id));
    const next = (anns ?? []).find((a: any) => !readSet.has(a.id)) ?? null;
    return { welcomed: !!profile?.welcomed_at, announcement: next };
  });

export const markAnnouncementRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("announcement_reads")
      .upsert({ user_id: context.userId, announcement_id: data.id }, { onConflict: "user_id,announcement_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markWelcomed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ welcomed_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin ----------

export const listAllAnnouncementsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("announcements")
      .select("id, title, body, cta_label, cta_href, kind, pinned, active, forum_topic_id, published_at, created_at, updated_at, created_by")
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(3).max(140),
  body: z.string().min(1).max(8000),
  kind: KIND.default("general"),
  ctaLabel: z.string().max(40).optional().nullable(),
  ctaHref: z.string().max(500).optional().nullable(),
  pinned: z.boolean().default(false),
  active: z.boolean().default(true),
  syncForumThread: z.boolean().default(true),
});

async function syncForumTopic(
  ctx: { supabase: any; userId: string },
  opts: { existingTopicId: string | null; title: string; body: string },
) {
  const forumBody = `📣 Official announcement\n\n${opts.body}`;
  if (opts.existingTopicId) {
    const { error } = await ctx.supabase
      .from("forum_topics")
      .update({ title: opts.title, body: forumBody, is_announcement: true })
      .eq("id", opts.existingTopicId);
    if (error) throw new Error(error.message);
    return opts.existingTopicId;
  }
  const { data, error } = await ctx.supabase
    .from("forum_topics")
    .insert({
      title: opts.title,
      body: forumBody,
      author_id: ctx.userId,
      is_announcement: true,
      is_pinned: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    let forumTopicId: string | null = null;
    if (data.syncForumThread) {
      forumTopicId = await syncForumTopic(context, {
        existingTopicId: null,
        title: data.title,
        body: data.body,
      });
    }
    const { data: row, error } = await context.supabase
      .from("announcements")
      .insert({
        title: data.title,
        body: data.body,
        kind: data.kind,
        cta_label: data.ctaLabel ?? null,
        cta_href: data.ctaHref ?? null,
        pinned: data.pinned,
        active: data.active,
        forum_topic_id: forumTopicId,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, forumTopicId };
  });

export const updateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    upsertSchema.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: existing, error: fetchErr } = await context.supabase
      .from("announcements")
      .select("forum_topic_id")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);

    let forumTopicId: string | null = existing.forum_topic_id;
    if (data.syncForumThread) {
      forumTopicId = await syncForumTopic(context, {
        existingTopicId: existing.forum_topic_id,
        title: data.title,
        body: data.body,
      });
    }

    const { error } = await context.supabase
      .from("announcements")
      .update({
        title: data.title,
        body: data.body,
        kind: data.kind,
        cta_label: data.ctaLabel ?? null,
        cta_href: data.ctaHref ?? null,
        pinned: data.pinned,
        active: data.active,
        forum_topic_id: forumTopicId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, forumTopicId };
  });

export const togglePinned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("announcements")
      .update({ pinned: data.pinned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("announcements")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
