import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTopics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: topics, error } = await context.supabase
      .from("forum_topics")
      .select("id, title, body, author_id, reply_count, like_count, last_activity_at, created_at")
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
      .select("id, title, body, author_id, reply_count, like_count, created_at")
      .eq("id", data.topicId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!topic) throw new Error("Topic not found.");

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
      topic: { ...topic, author: map[topic.author_id] ?? null, liked_by_me: likedTopic.has(topic.id) },
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
    z.object({ title: z.string().min(3).max(140), body: z.string().min(1).max(8000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("forum_topics")
      .insert({ title: data.title, body: data.body, author_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
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
