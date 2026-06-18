import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const UuidSchema = z.string().uuid();
const PieceDefJson = z.record(z.string(), z.unknown());

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "piece";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

// ---------- AI: pick a single emoji that represents the piece ----------

const EmojiInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(400).default(""),
});

export const suggestPieceEmoji = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EmojiInput.parse(i))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "AI is not configured." };
    try {
      const gateway = createLovableAiGatewayProvider(key);
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system:
          "You pick ONE single Unicode emoji that best represents a custom chess piece. " +
          "Reply with ONLY that emoji character — no words, no punctuation, no quotes, no spaces.",
        prompt: `Piece name: ${data.name}\nDescription: ${data.description || "(none)"}\n\nReply with one emoji.`,
        maxOutputTokens: 20,
      });
      // Take the first non-whitespace character cluster.
      const cleaned = text.trim();
      // Naive: grab up to 4 chars (handles most multi-codepoint emoji).
      const emoji = cleaned.split(/\s+/)[0]?.slice(0, 8) ?? "";
      if (!emoji) return { ok: false as const, error: "AI didn't return an emoji." };
      return { ok: true as const, emoji };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/402/.test(msg)) return { ok: false as const, error: "AI credits exhausted." };
      if (/429/.test(msg)) return { ok: false as const, error: "AI rate-limited. Try again shortly." };
      return { ok: false as const, error: "Couldn't pick an emoji right now." };
    }
  });

// ---------- Save / publish a custom piece ----------

const SaveInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(400).default(""),
  def: PieceDefJson,
  visibility: z.enum(["private", "public"]),
});

export const savePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = slugify(data.name);
      const { data: row, error } = await context.supabase
        .from("custom_pieces")
        .insert({
          author_id: context.userId,
          slug,
          name: data.name,
          description: data.description,
          def: data.def as never,
          visibility: data.visibility,
        })
        .select("id, slug")
        .single();
      if (!error) return row;
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("Could not generate a unique link. Please try again.");
  });

// ---------- List queries ----------

const PIECE_COLS = "id, slug, name, description, def, visibility, like_count, created_at, author_id";

export const listMyPieces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("custom_pieces")
      .select(PIECE_COLS)
      .eq("author_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listDiscoveryPieces = createServerFn({ method: "GET" })
  .handler(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { Database } = await import("@/integrations/supabase/types").then((m) => ({ Database: null as unknown as typeof m extends { Database: infer D } ? D : never }));
    void Database;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    type Row = {
      id: string; slug: string; name: string; description: string;
      def: unknown; visibility: string; like_count: number;
      created_at: string; author_id: string;
    };
    if (!url || !key) return { newest: [] as Row[], popular: [] as Row[], archive: [] as Row[] };
    const sb = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const [newest, popular, archive] = await Promise.all([
      sb.from("custom_pieces").select(PIECE_COLS).eq("visibility", "public")
        .order("created_at", { ascending: false }).limit(10),
      sb.from("custom_pieces").select(PIECE_COLS).eq("visibility", "public")
        .order("like_count", { ascending: false })
        .order("created_at", { ascending: false }).limit(10),
      sb.from("custom_pieces").select(PIECE_COLS).eq("visibility", "public")
        .order("created_at", { ascending: false }).range(10, 109),
    ]);
    const newestRows = (newest.data ?? []) as Row[];
    const newestIds = new Set(newestRows.map((r) => r.id));
    const popularRows = ((popular.data ?? []) as Row[]).filter((r) => !newestIds.has(r.id));
    return {
      newest: newestRows,
      popular: popularRows,
      archive: (archive.data ?? []) as Row[],
    };
  });


// ---------- Likes ----------

export const likePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pieceId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("piece_likes")
      .insert({ piece_id: data.pieceId, user_id: context.userId });
    if (error && error.code !== "23505") throw new Error(error.message);
    return { ok: true };
  });

export const unlikePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pieceId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("piece_likes")
      .delete()
      .eq("piece_id", data.pieceId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pieceId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("custom_pieces")
      .delete()
      .eq("id", data.pieceId)
      .eq("author_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
