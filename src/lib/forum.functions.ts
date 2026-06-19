import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Json = Database["public"]["Tables"]["forum_topics"]["Row"]["shared_design"];

const SharedDesignSchema = z
  .object({
    design: z.unknown(),
    name: z.string().min(1).max(80),
  })
  .optional();

async function isAdminOrMod(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  return roles.includes("admin") || roles.includes("moderator");
}

export const listTopics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: topics, error } = await context.supabase
      .from("forum_topics")
      .select("id, title, body, author_id, reply_count, like_count, last_activity_at, created_at, is_featured, is_pinned, is_announcement, shared_design, shared_design_name")
      .order("is_pinned", { ascending: false })
      .order("is_featured", { ascending: false })
      .order("last_activity_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const authorIds = Array.from(new Set((topics ?? []).map((t) => t.author_id)));
    const authorsMap: Record<string, { username: string; display_name: string | null }> = {};
    if (authorIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", authorIds);
      for (const p of profs ?? []) authorsMap[p.id] = { username: p.username, display_name: p.display_name };
    }
    const { data: likes } = await context.supabase
      .from("forum_likes")
      .select("target_id")
      .eq("user_id", context.userId)
      .eq("target_type", "topic");
    const liked = new Set((likes ?? []).map((l) => l.target_id));
    return (topics ?? []).map((t) => ({
      ...t,
      author: authorsMap[t.author_id] ?? null,
      liked_by_me: liked.has(t.id),
    }));
  });

export const getTopic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ topicId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: topic, error } = await context.supabase
      .from("forum_topics")
      .select("id, title, body, author_id, reply_count, like_count, created_at, is_featured, is_pinned, shared_design, shared_design_name, shared_piece_id, is_showcase")
      .eq("id", data.topicId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!topic) throw new Error("Topic not found.");

    // Resolve the linked custom piece, if any.
    let sharedPiece: {
      id: string; slug: string; name: string; description: string;
      def: unknown; image_url: string | null;
    } | null = null;
    if (topic.shared_piece_id) {
      const { data: p } = await context.supabase
        .from("custom_pieces")
        .select("id, slug, name, description, def, image_url")
        .eq("id", topic.shared_piece_id)
        .maybeSingle();
      if (p) sharedPiece = p as unknown as typeof sharedPiece;
    }

    const { data: replies, error: rErr } = await context.supabase
      .from("forum_replies")
      .select("id, body, author_id, like_count, created_at")
      .eq("topic_id", data.topicId)
      .order("created_at", { ascending: true });
    if (rErr) throw new Error(rErr.message);

    const ids = Array.from(new Set([topic.author_id, ...(replies ?? []).map((r) => r.author_id)]));
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ids);
    const map: Record<string, { username: string; display_name: string | null }> = {};
    for (const p of profs ?? []) map[p.id] = { username: p.username, display_name: p.display_name };

    const replyIds = (replies ?? []).map((r) => r.id);
    const { data: likes } = await context.supabase
      .from("forum_likes")
      .select("target_id, target_type")
      .eq("user_id", context.userId)
      .in("target_id", [topic.id, ...replyIds]);
    const likedTopic = new Set((likes ?? []).filter((l) => l.target_type === "topic").map((l) => l.target_id));
    const likedReply = new Set((likes ?? []).filter((l) => l.target_type === "reply").map((l) => l.target_id));

    return {
      topic: { ...topic, author: map[topic.author_id] ?? null, liked_by_me: likedTopic.has(topic.id), shared_piece: sharedPiece },
      replies: (replies ?? []).map((r) => ({
        ...r,
        author: map[r.author_id] ?? null,
        liked_by_me: likedReply.has(r.id),
      })),
    };
  });

export const createTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(3).max(140),
        body: z.string().min(1).max(8000),
        isFeatured: z.boolean().optional(),
        sharedDesign: SharedDesignSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await isAdminOrMod(context);
    if (!admin) throw new Error("Only admins can post topics. Try suggesting one instead.");
    const { data: row, error } = await context.supabase
      .from("forum_topics")
      .insert({
        title: data.title,
        body: data.body,
        author_id: context.userId,
        is_featured: data.isFeatured ?? false,
        shared_design: (data.sharedDesign?.design ?? null) as Json,
        shared_design_name: data.sharedDesign?.name ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const createSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(3).max(140),
        body: z.string().min(1).max(8000),
        sharedDesign: SharedDesignSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("topic_suggestions").insert({
      title: data.title,
      body: data.body,
      suggester_id: context.userId,
      shared_design: (data.sharedDesign?.design ?? null) as Json,
      shared_design_name: data.sharedDesign?.name ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ topicId: z.string().uuid(), body: z.string().min(1).max(8000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("forum_replies")
      .insert({ topic_id: data.topicId, body: data.body, author_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ targetType: z.enum(["topic", "reply"]), targetId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("forum_likes")
      .select("id")
      .eq("user_id", context.userId)
      .eq("target_type", data.targetType)
      .eq("target_id", data.targetId)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase.from("forum_likes").delete().eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
    const { error } = await context.supabase.from("forum_likes").insert({
      user_id: context.userId,
      target_type: data.targetType,
      target_id: data.targetId,
    });
    if (error) throw new Error(error.message);
    return { liked: true };
  });
