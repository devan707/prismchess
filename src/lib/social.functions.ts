import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ===== Helpers =====
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "game";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

const UuidSchema = z.string().uuid();

// ============ FRIENDS ============

export const listFriends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("friendships")
      .select("id, user_a, user_b, status, requested_by, created_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const otherIds = Array.from(new Set(rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a))));
    const profiles = otherIds.length
      ? (await supabase.from("profiles").select("id, username, display_name, avatar").in("id", otherIds)).data ?? []
      : [];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return rows.map((r) => {
      const otherId = r.user_a === userId ? r.user_b : r.user_a;
      return {
        id: r.id,
        status: r.status,
        requested_by: r.requested_by,
        incoming: r.status === "pending" && r.requested_by !== userId,
        outgoing: r.status === "pending" && r.requested_by === userId,
        other: byId.get(otherId) ?? { id: otherId, username: "unknown", display_name: null, avatar: null },
      };
    });
  });

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ targetId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.targetId === userId) throw new Error("You can't friend yourself.");
    const [a, b] = canonicalPair(userId, data.targetId);
    const { error } = await supabase
      .from("friendships")
      .insert({ user_a: a, user_b: b, requested_by: userId, status: "pending" });
    if (error) {
      if (error.code === "23505") throw new Error("Friend request already exists.");
      throw new Error(error.message);
    }

    // Notify the recipient.
    const { data: me } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", userId)
      .maybeSingle();
    const senderName = me?.display_name || me?.username || "Someone";
    const { sendPushBackground } = await import("./push.server");
    sendPushBackground(data.targetId, {
      title: "New friend request",
      body: `${senderName} wants to be friends.`,
      url: `/friends`,
      tag: `friend:${userId}`,
    });

    return { ok: true };
  });

export const respondFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ friendshipId: UuidSchema, accept: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.accept) {
      const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", data.friendshipId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("friendships").delete().eq("id", data.friendshipId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const removeFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ otherId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const [a, b] = canonicalPair(context.userId, data.otherId);
    const { error } = await context.supabase
      .from("friendships").delete().eq("user_a", a).eq("user_b", b);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getFriendshipWith = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ otherId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const [a, b] = canonicalPair(context.userId, data.otherId);
    const { data: row } = await context.supabase
      .from("friendships").select("id, status, requested_by").eq("user_a", a).eq("user_b", b).maybeSingle();
    return row;
  });

// ============ BLOCKS ============

export const listBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("blocks").select("blocked_id, created_at").eq("blocker_id", context.userId);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => r.blocked_id);
    if (!ids.length) return [];
    const { data: profs } = await context.supabase
      .from("profiles").select("id, username, display_name, avatar").in("id", ids);
    return (profs ?? []).map((p) => ({ ...p }));
  });

export const blockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ targetId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.targetId === context.userId) throw new Error("You can't block yourself.");
    const [a, b] = canonicalPair(context.userId, data.targetId);
    await context.supabase.from("friendships").delete().eq("user_a", a).eq("user_b", b);
    const { error } = await context.supabase
      .from("blocks").insert({ blocker_id: context.userId, blocked_id: data.targetId });
    if (error && error.code !== "23505") throw new Error(error.message);
    return { ok: true };
  });

export const unblockUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ targetId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blocks").delete().eq("blocker_id", context.userId).eq("blocked_id", data.targetId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ DM THREADS / MESSAGES ============

export const listDmThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: threads, error } = await supabase
      .from("dm_threads")
      .select("id, user_a, user_b, last_message_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const rows = threads ?? [];
    const otherIds = Array.from(new Set(rows.map((t) => (t.user_a === userId ? t.user_b : t.user_a))));
    const profiles = otherIds.length
      ? (await supabase.from("profiles").select("id, username, display_name, avatar").in("id", otherIds)).data ?? []
      : [];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    // Unread counts via individual selects (small N).
    const out = await Promise.all(rows.map(async (t) => {
      const otherId = t.user_a === userId ? t.user_b : t.user_a;
      const { count } = await supabase
        .from("dm_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", t.id)
        .neq("sender_id", userId)
        .is("read_at", null);
      const { data: last } = await supabase
        .from("dm_messages").select("body, sender_id, created_at")
        .eq("thread_id", t.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return {
        id: t.id,
        last_message_at: t.last_message_at,
        unread: count ?? 0,
        last: last ?? null,
        other: byId.get(otherId) ?? { id: otherId, username: "unknown", display_name: null, avatar: null },
      };
    }));
    return out;
  });

export const unreadDmCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: threads } = await supabase
      .from("dm_threads").select("id").or(`user_a.eq.${userId},user_b.eq.${userId}`);
    if (!threads?.length) return { count: 0 };
    const { count } = await supabase
      .from("dm_messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", threads.map((t) => t.id))
      .neq("sender_id", userId)
      .is("read_at", null);
    return { count: count ?? 0 };
  });

export const openOrCreateDmThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ otherId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.otherId === userId) throw new Error("Can't message yourself.");
    const [a, b] = canonicalPair(userId, data.otherId);
    const { data: existing } = await supabase
      .from("dm_threads").select("id").eq("user_a", a).eq("user_b", b).maybeSingle();
    if (existing) return { threadId: existing.id };
    const { data: inserted, error } = await supabase
      .from("dm_threads").insert({ user_a: a, user_b: b }).select("id").single();
    if (error) {
      throw new Error("You can only message friends or your current opponent.");
    }
    return { threadId: inserted.id };
  });

export const getDmThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ threadId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: thread, error } = await supabase
      .from("dm_threads").select("id, user_a, user_b").eq("id", data.threadId).maybeSingle();
    if (error || !thread) throw new Error("Thread not found.");
    const otherId = thread.user_a === userId ? thread.user_b : thread.user_a;
    const { data: other } = await supabase
      .from("profiles").select("id, username, display_name, avatar").eq("id", otherId).maybeSingle();
    const { data: messages } = await supabase
      .from("dm_messages")
      .select("id, sender_id, body, created_at, read_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true })
      .limit(200);
    return { thread, other, messages: messages ?? [] };
  });

export const sendDm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    threadId: UuidSchema,
    body: z.string().trim().min(1).max(2000),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error, data: inserted } = await context.supabase
      .from("dm_messages")
      .insert({ thread_id: data.threadId, sender_id: context.userId, body: data.body })
      .select("id, sender_id, body, created_at, read_at").single();
    if (error) throw new Error(error.message);

    // Notify the other thread participant.
    const { data: thread } = await context.supabase
      .from("dm_threads")
      .select("user_a, user_b")
      .eq("id", data.threadId)
      .maybeSingle();
    if (thread) {
      const recipient = thread.user_a === context.userId ? thread.user_b : thread.user_a;
      const { data: me } = await context.supabase
        .from("profiles")
        .select("username, display_name")
        .eq("id", context.userId)
        .maybeSingle();
      const senderName = me?.display_name || me?.username || "Someone";
      const preview = data.body.length > 80 ? data.body.slice(0, 77) + "…" : data.body;
      const { sendPushBackground } = await import("./push.server");
      sendPushBackground(recipient, {
        title: `Message from ${senderName}`,
        body: preview,
        url: `/messages/${data.threadId}`,
        tag: `dm:${data.threadId}`,
      });
    }

    return inserted;
  });

export const markDmRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ threadId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("dm_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", data.threadId)
      .neq("sender_id", context.userId)
      .is("read_at", null);
    return { ok: true };
  });

// ============ MATCH CHAT ============

export const listMatchMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ matchId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("match_chat_messages")
      .select("id, sender_id, body, created_at")
      .eq("match_id", data.matchId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const sendMatchMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    matchId: UuidSchema,
    body: z.string().trim().min(1).max(2000),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error, data: inserted } = await context.supabase
      .from("match_chat_messages")
      .insert({ match_id: data.matchId, sender_id: context.userId, body: data.body })
      .select("id, sender_id, body, created_at").single();
    if (error) throw new Error(error.message);
    return inserted;
  });

// ============ PUBLISHED GAMES ============

const DesignJsonSchema = z.record(z.string(), z.unknown());
const TutorialJsonSchema = z.record(z.string(), z.unknown()).nullable().optional();

/** Deep stable equality for plain JSON values (objects, arrays, primitives). */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    if (!jsonEqual(ao[ak[i]], bo[bk[i]])) return false;
  }
  return true;
}

export const publishGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    gameId: UuidSchema.nullable().optional(),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(2000),
    design: DesignJsonSchema,
    tutorial: TutorialJsonSchema,
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load all of this author's existing published games once for dedupe checks.
    const { data: mine, error: mineErr } = await supabase
      .from("published_games")
      .select("id, slug, name, design")
      .eq("author_id", userId);
    if (mineErr) throw new Error(mineErr.message);
    const rows = mine ?? [];
    const nameLower = data.name.toLowerCase();

    // If updating an existing record, verify ownership and apply update in place.
    if (data.gameId) {
      const target = rows.find((r) => r.id === data.gameId);
      if (!target) throw new Error("You can only update a variant you published.");
      // Name must remain unique among your other variants.
      const nameClash = rows.find((r) => r.id !== data.gameId && r.name.toLowerCase() === nameLower);
      if (nameClash) throw new Error(`You already have a published variant named "${nameClash.name}". Choose a different name.`);
      // Design must not be identical to a different variant of yours.
      const dupDesign = rows.find((r) => r.id !== data.gameId && jsonEqual(r.design, data.design));
      if (dupDesign) throw new Error(`This board is identical to your variant "${dupDesign.name}". Update that one instead.`);
      const { data: updated, error } = await supabase
        .from("published_games")
        .update({
          name: data.name,
          description: data.description,
          design: data.design as never,
          tutorial: (data.tutorial ?? null) as never,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.gameId)
        .eq("author_id", userId)
        .select("id, slug").single();
      if (error) throw new Error(error.message);
      return { ...updated, updated: true as const };
    }

    // New publish — block duplicates by name OR by identical design.
    const sameName = rows.find((r) => r.name.toLowerCase() === nameLower);
    if (sameName) {
      throw new Error(`You already published a variant named "${sameName.name}". Open it from your library to update it instead of creating a new listing.`);
    }
    const sameDesign = rows.find((r) => jsonEqual(r.design, data.design));
    if (sameDesign) {
      throw new Error(`This board is identical to your published variant "${sameDesign.name}". Update that one instead of publishing a duplicate.`);
    }

    // Retry slug a few times if collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = slugify(data.name);
      const { data: inserted, error } = await supabase
        .from("published_games")
        .insert({
          author_id: userId,
          slug,
          name: data.name,
          description: data.description,
          design: data.design as never,
          tutorial: (data.tutorial ?? null) as never,
        })
        .select("id, slug").single();
      if (!error) return { ...inserted, updated: false as const };
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("Could not generate a unique link, please try again.");
  });

export const unpublishGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ gameId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("published_games").delete().eq("id", data.gameId).eq("author_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPublishedGames = createServerFn({ method: "GET" })
  .handler(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supa
      .from("published_games")
      .select("id, slug, name, description, like_count, comment_count, created_at, author_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
    const profiles = authorIds.length
      ? (await supa.from("profiles").select("id, username, display_name, avatar").in("id", authorIds)).data ?? []
      : [];
    const byId = new Map(profiles.map((p: { id: string; username: string; display_name: string | null; avatar: string | null }) => [p.id, p]));
    return rows.map((r) => ({ ...r, author: byId.get(r.author_id) ?? null }));
  });

/**
 * Discovery feed for the home page:
 * - newest: 10 most recently published games
 * - popular: 10 most-liked games (excluding any already in newest)
 * - archive: everything else, newest first, up to 100
 */
export const listDiscoveryGames = createServerFn({ method: "GET" })
  .handler(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const cols = "id, slug, name, description, like_count, comment_count, created_at, author_id, design";
    const [newestRes, popularRes, archiveRes] = await Promise.all([
      supa.from("published_games").select(cols).eq("is_hidden", false).order("created_at", { ascending: false }).limit(10),
      supa.from("published_games").select(cols).eq("is_hidden", false).order("like_count", { ascending: false }).order("created_at", { ascending: false }).limit(10),
      supa.from("published_games").select(cols).eq("is_hidden", false).order("created_at", { ascending: false }).range(10, 109),
    ]);
    if (newestRes.error) throw new Error(newestRes.error.message);
    if (popularRes.error) throw new Error(popularRes.error.message);
    if (archiveRes.error) throw new Error(archiveRes.error.message);
    const newest = newestRes.data ?? [];
    const popularAll = popularRes.data ?? [];
    const archiveAll = archiveRes.data ?? [];
    const newestIds = new Set(newest.map((g) => g.id));
    const popular = popularAll.filter((g) => !newestIds.has(g.id)).slice(0, 10);
    const featuredIds = new Set([...newestIds, ...popular.map((g) => g.id)]);
    const archive = archiveAll.filter((g) => !featuredIds.has(g.id));

    const all = [...newest, ...popular, ...archive];
    const authorIds = Array.from(new Set(all.map((r) => r.author_id)));
    const profiles = authorIds.length
      ? (await supa.from("profiles").select("id, username, display_name, avatar").in("id", authorIds)).data ?? []
      : [];
    const byId = new Map(profiles.map((p: { id: string; username: string; display_name: string | null; avatar: string | null }) => [p.id, p]));
    const decorate = (r: typeof newest[number]) => {
      const d = r.design as { rows?: number; cols?: number } | null;
      const { design: _design, ...rest } = r;
      void _design;
      return { ...rest, rows: d?.rows ?? null, cols: d?.cols ?? null, author: byId.get(r.author_id) ?? null };
    };
    return {
      newest: newest.map(decorate),
      popular: popular.map(decorate),
      archive: archive.map(decorate),
    };
  });

export const getPublishedGame = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(i))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: game, error } = await supa
      .from("published_games").select("*").eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!game) return null;
    const { data: author } = await supa
      .from("profiles").select("id, username, display_name, avatar").eq("id", game.author_id).maybeSingle();
    return { game, author };
  });

export const listMyPublishedGames = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("published_games")
      .select("id, slug, name, description, like_count, comment_count, created_at")
      .eq("author_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============ LIKES ============

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ gameId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("game_likes").select("game_id").eq("game_id", data.gameId).eq("user_id", context.userId).maybeSingle();
    if (existing) {
      await context.supabase.from("game_likes").delete().eq("game_id", data.gameId).eq("user_id", context.userId);
      return { liked: false };
    }
    const { error } = await context.supabase
      .from("game_likes").insert({ game_id: data.gameId, user_id: context.userId });
    if (error && error.code !== "23505") throw new Error(error.message);
    return { liked: true };
  });

export const getMyLikeState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ gameId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("game_likes").select("game_id").eq("game_id", data.gameId).eq("user_id", context.userId).maybeSingle();
    return { liked: !!row };
  });

// ============ COMMENTS ============

export const listComments = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ gameId: UuidSchema }).parse(i))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: rows, error } = await supa
      .from("game_comments")
      .select("id, parent_id, author_id, body, created_at, updated_at")
      .eq("game_id", data.gameId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const authorIds = Array.from(new Set((rows ?? []).map((r) => r.author_id)));
    const profiles = authorIds.length
      ? (await supa.from("profiles").select("id, username, display_name, avatar").in("id", authorIds)).data ?? []
      : [];
    const byId = new Map(profiles.map((p: { id: string; username: string; display_name: string | null; avatar: string | null }) => [p.id, p]));
    return (rows ?? []).map((r) => ({ ...r, author: byId.get(r.author_id) ?? null }));
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    gameId: UuidSchema,
    parentId: UuidSchema.nullable().optional(),
    body: z.string().trim().min(1).max(1000),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error, data: inserted } = await context.supabase
      .from("game_comments")
      .insert({ game_id: data.gameId, parent_id: data.parentId ?? null, author_id: context.userId, body: data.body })
      .select("id").single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ commentId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("game_comments").delete().eq("id", data.commentId).eq("author_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ REPORTS ============

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    targetType: z.enum(["user","dm_message","match_message","comment","game"]),
    targetId: UuidSchema,
    reason: z.string().trim().min(1).max(500),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("reports")
      .insert({ reporter_id: context.userId, target_type: data.targetType, target_id: data.targetId, reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ PROFILE LOOKUP ============

export const getPublicProfile = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ username: z.string().min(1).max(40) }).parse(i))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: profile } = await supa
      .from("profiles").select("id, username, display_name, avatar, created_at").eq("username", data.username).maybeSingle();
    if (!profile) return null;
    const { data: games } = await supa
      .from("published_games")
      .select("id, slug, name, description, like_count, comment_count, created_at")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false });
    return { profile, games: games ?? [] };
  });
