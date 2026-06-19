import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

/**
 * Featured-content promotion flow:
 *   1. admin promotes a piece/variant (existing flag functions).
 *   2. author gets a notification.
 *   3. admin is prompted to publish a forum announcement (AI-drafted).
 *      The announcement is filed in the "Featured Showcase" forum category.
 *      The author gets a second notification linking to that topic.
 */

const FEATURED_CATEGORY = "featured-showcase";

const TargetSchema = z.object({
  targetType: z.enum(["piece", "variant"]),
  targetId: z.string().uuid(),
});

async function assertMod(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.includes("admin") && !roles.includes("moderator")) {
    throw new Error("Forbidden");
  }
}

async function loadTarget(
  ctx: { supabase: any },
  targetType: "piece" | "variant",
  targetId: string,
) {
  if (targetType === "piece") {
    const { data, error } = await ctx.supabase
      .from("custom_pieces")
      .select("id, slug, name, description, author_id, def, movement_summary")
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Piece not found.");
    return {
      kind: "piece" as const,
      id: data.id as string,
      slug: data.slug as string,
      name: data.name as string,
      description: (data.description as string | null) ?? "",
      author_id: data.author_id as string,
      def: data.def,
      movement_summary: (data.movement_summary as string | null) ?? "",
    };
  }
  const { data, error } = await ctx.supabase
    .from("published_games")
    .select("id, slug, name, description, author_id, design")
    .eq("id", targetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Variant not found.");
  return {
    kind: "variant" as const,
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    description: (data.description as string | null) ?? "",
    author_id: data.author_id as string,
    design: data.design,
  };
}

async function fetchAuthorUsername(ctx: { supabase: any }, authorId: string) {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", authorId)
    .maybeSingle();
  return {
    username: (data?.username as string | undefined) ?? "player",
    display_name: (data?.display_name as string | null | undefined) ?? null,
  };
}

/**
 * Insert the "your work was promoted" inbox notification.
 * Caller already verified admin/mod role.
 */
async function notifyAuthorOfPromotion(
  ctx: { supabase: any },
  args: {
    authorId: string;
    targetType: "piece" | "variant";
    targetId: string;
    targetName: string;
    targetSlug: string;
  },
) {
  const isPiece = args.targetType === "piece";
  const title = isPiece
    ? `Your piece "${args.targetName}" is now a signature piece!`
    : `Your variant "${args.targetName}" is now a signature variant!`;
  const body = isPiece
    ? "An admin added your custom piece to the signature library so everyone can use it. Nice work."
    : "An admin promoted your variant into the signature collection. Players can now discover it on the home page.";
  const link = isPiece ? `/pieces/${args.targetSlug}` : `/g/${args.targetSlug}`;
  await ctx.supabase.from("notifications").insert({
    user_id: args.authorId,
    kind: isPiece ? "piece_promoted" : "variant_promoted",
    title,
    body,
    link,
    metadata: {
      target_type: args.targetType,
      target_id: args.targetId,
      target_slug: args.targetSlug,
      target_name: args.targetName,
    },
  });
}

/** Exported so the flag-flip server fns can call it inline. */
export async function notifyPromotionInline(
  ctx: { supabase: any },
  args: {
    authorId: string;
    targetType: "piece" | "variant";
    targetId: string;
    targetName: string;
    targetSlug: string;
  },
) {
  return notifyAuthorOfPromotion(ctx, args);
}

// ─── AI draft ─────────────────────────────────────────────────────────────

export const draftPromotionAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TargetSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const target = await loadTarget(context, data.targetType, data.targetId);
    const author = await fetchAuthorUsername(context, target.author_id);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      // Fallback: simple template so the dialog still works without AI.
      return {
        title:
          data.targetType === "piece"
            ? `Featured piece: ${target.name}`
            : `Featured variant: ${target.name}`,
        body:
          `${target.name} by @${author.username} just joined the signature collection. ` +
          `Give it a try and share what you think.`,
      };
    }

    try {
      const gateway = createLovableAiGatewayProvider(key);
      const subjectLabel = data.targetType === "piece" ? "custom piece" : "custom variant";
      const detailLines: string[] = [
        `Name: ${target.name}`,
        `Creator: @${author.username}${author.display_name ? ` (${author.display_name})` : ""}`,
      ];
      if (target.description) detailLines.push(`Creator's description: ${target.description}`);
      if (target.kind === "piece" && target.movement_summary) {
        detailLines.push(`Movement summary: ${target.movement_summary}`);
      }
      const link = target.kind === "piece" ? `/pieces/${target.slug}` : `/g/${target.slug}`;

      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system:
          "You are the community manager for Prism Chess, an experimental chess-variant platform. " +
          "Write a SHORT forum announcement celebrating that a community member's " +
          `${subjectLabel} was just added to the signature collection. ` +
          "Voice: warm, peer-to-peer, slightly excited — never corporate or promotional. " +
          "Address the community, credit the creator by @username, briefly describe what makes it cool, " +
          "and invite players to try it and discuss in the replies. " +
          "Do NOT invent rules, stats, or backstory that aren't in the provided details. " +
          "Output a single JSON object: {\"title\": string (≤80 chars), \"body\": string (≤600 chars, plain text, 2-4 short paragraphs separated by blank lines)}. " +
          "No markdown, no headings, no code fences — just the JSON.",
        prompt:
          detailLines.join("\n") +
          `\n\nLink to share inside the body: ${link}`,
        maxOutputTokens: 600,
      });

      const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      const parsed = JSON.parse(cleaned) as { title?: string; body?: string };
      const title = (parsed.title ?? "").trim().slice(0, 140) ||
        `Featured ${data.targetType}: ${target.name}`;
      const body = (parsed.body ?? "").trim().slice(0, 4000) ||
        `${target.name} by @${author.username} is now part of the signature collection.`;
      return { title, body };
    } catch {
      return {
        title:
          data.targetType === "piece"
            ? `Featured piece: ${target.name}`
            : `Featured variant: ${target.name}`,
        body:
          `${target.name} by @${author.username} just joined the signature collection. ` +
          `Give it a try and share your thoughts.`,
      };
    }
  });

// ─── Publish announcement ─────────────────────────────────────────────────

const PublishInput = TargetSchema.extend({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(1).max(8000),
});

export const publishPromotionAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PublishInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertMod(context);
    const target = await loadTarget(context, data.targetType, data.targetId);

    const isPiece = data.targetType === "piece";
    const insertBody: Record<string, unknown> = {
      title: data.title,
      body: data.body,
      author_id: context.userId,
      is_featured: true,
      is_announcement: true,
      category: FEATURED_CATEGORY,
    };
    if (isPiece) {
      insertBody.shared_piece_id = target.id;
    } else if ("design" in target && target.design) {
      insertBody.shared_design = target.design;
      insertBody.shared_design_name = target.name;
    }

    const { data: topic, error } = await context.supabase
      .from("forum_topics")
      .insert(insertBody as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const link = `/forum/${topic.id}`;
    await context.supabase.from("notifications").insert({
      user_id: target.author_id,
      kind: isPiece ? "piece_announcement" : "variant_announcement",
      title: isPiece
        ? `"${target.name}" was just announced on the forum`
        : `"${target.name}" was just announced on the forum`,
      body:
        "An admin posted a Featured Showcase announcement about your work. " +
        "Tap to read it and join the discussion.",
      link,
      metadata: {
        target_type: data.targetType,
        target_id: target.id,
        target_slug: target.slug,
        target_name: target.name,
        forum_topic_id: topic.id as string,
      },
    });

    await context.supabase.rpc("log_admin_action", {
      _action: isPiece ? "piece.promotion_announcement" : "variant.promotion_announcement",
      _target_type: isPiece ? "custom_piece" : "published_game",
      _target_id: target.id,
      _details: { topic_id: topic.id } as never,
    });

    return { topicId: topic.id as string };
  });
