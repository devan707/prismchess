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

// NOTE: There is intentionally NO updatePiece server fn. Custom pieces are
// immutable once saved so other people's published games that embed the piece
// keep working exactly as designed. To "edit" a piece, the UI forks it via
// `/pieces/new?from=<slug>` and creates a brand-new piece (see savePiece).

// ---------- Get one of my pieces (by slug) for duplication/forking ----------

export const getMyPieceBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: z.string().trim().min(1).max(60) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("custom_pieces")
      .select("id, slug, name, description, def, visibility, image_url, author_id")
      .eq("slug", data.slug)
      .eq("author_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- List queries ----------

const PIECE_COLS = "id, slug, name, description, def, visibility, like_count, created_at, author_id, image_url";

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

/** Pieces this user has liked — joined with the custom_pieces row. */
export const listMyLikedPieces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: likes, error: likeErr } = await context.supabase
      .from("piece_likes")
      .select("piece_id, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (likeErr) throw new Error(likeErr.message);
    const ids = (likes ?? []).map((l) => l.piece_id);
    if (ids.length === 0) return [];
    const { data: pieces, error: piecesErr } = await context.supabase
      .from("custom_pieces")
      .select("id, slug, name, description, def, visibility, like_count, created_at, author_id, image_url, is_hidden")
      .in("id", ids);
    if (piecesErr) throw new Error(piecesErr.message);
    type Row = {
      id: string; slug: string; name: string; description: string;
      def: import("@/integrations/supabase/types").Json; visibility: string;
      like_count: number; created_at: string; author_id: string;
      image_url: string | null; is_hidden: boolean;
    };
    const visible = ((pieces ?? []) as unknown as Row[]).filter((p) => !p.is_hidden);
    const order = new Map(ids.map((id, i) => [id, i] as const));
    return visible.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  });

export const listDiscoveryPieces = createServerFn({ method: "GET" })
  .handler(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    type Row = {
      id: string; slug: string; name: string; description: string;
      def: import("@/integrations/supabase/types").Json;
      visibility: string; like_count: number;
      created_at: string; author_id: string;
    };
    if (!url || !key) return { newest: [] as Row[], popular: [] as Row[], archive: [] as Row[] };
    const sb = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const [newest, popular, archive] = await Promise.all([
      sb.from("custom_pieces").select(PIECE_COLS).eq("visibility", "public").eq("is_hidden", false)
        .order("created_at", { ascending: false }).limit(10),
      sb.from("custom_pieces").select(PIECE_COLS).eq("visibility", "public").eq("is_hidden", false)
        .order("like_count", { ascending: false })
        .order("created_at", { ascending: false }).limit(10),
      sb.from("custom_pieces").select(PIECE_COLS).eq("visibility", "public").eq("is_hidden", false)
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

// ---------- Public piece-by-slug (for shareable detail pages) ----------

export const getPieceBySlug = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ slug: z.string().trim().min(1).max(60) }).parse(i))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: row, error } = await sb
      .from("custom_pieces")
      .select("id, slug, name, description, def, visibility, like_count, created_at, author_id, image_url, is_hidden")
      .eq("slug", data.slug)
      .eq("visibility", "public")
      .eq("is_hidden", false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const typedRow = row as {
      id: string; slug: string; name: string; description: string;
      def: import("@/integrations/supabase/types").Json; visibility: string; like_count: number;
      created_at: string; author_id: string; image_url: string | null; is_hidden: boolean;
    };
    const { data: prof } = await sb
      .from("profiles")
      .select("username, display_name")
      .eq("id", typedRow.author_id)
      .maybeSingle();
    return { ...typedRow, author: (prof ?? null) as { username: string; display_name: string | null } | null };
  });

// ---------- Upload / clear image (PNG 300×300 transparent) ----------

/** Parse PNG width/height/color-type from the first 26 bytes of the file. */
function parsePngHeader(buf: Uint8Array): { width: number; height: number; colorType: number } | null {
  if (buf.length < 26) return null;
  // Signature: 89 50 4E 47 0D 0A 1A 0A
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  // IHDR chunk starts at byte 8; width = bytes 16..19, height = 20..23, colorType = 25
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  const colorType = buf[25];
  return { width, height, colorType };
}

export const uploadPieceImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Expected multipart upload.");
    const pieceId = String(input.get("pieceId") ?? "");
    if (!UuidSchema.safeParse(pieceId).success) throw new Error("Invalid pieceId.");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("Missing file.");
    return { pieceId, file };
  })
  .handler(async ({ data, context }) => {
    const { pieceId, file } = data;
    if (file.size > 1_000_000) throw new Error("Image must be under 1 MB.");
    if (file.type && file.type !== "image/png") throw new Error("Image must be a PNG.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = parsePngHeader(bytes);
    if (!header) throw new Error("File is not a valid PNG.");
    if (header.width !== 300 || header.height !== 300) {
      throw new Error(`Image must be exactly 300×300 (got ${header.width}×${header.height}).`);
    }
    // PNG colour types with alpha: 4 (grayscale+alpha), 6 (RGBA), or 3 (paletted, may have tRNS).
    if (header.colorType !== 4 && header.colorType !== 6 && header.colorType !== 3) {
      throw new Error("Image must have a transparent background (PNG with alpha channel).");
    }

    // Confirm ownership before writing — RLS would also block this, but a
    // clear error message beats a generic 'row violates policy'.
    const { data: piece, error: ownErr } = await context.supabase
      .from("custom_pieces")
      .select("id, slug, author_id")
      .eq("id", pieceId)
      .maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    if (!piece) throw new Error("Piece not found.");
    if (piece.author_id !== context.userId) throw new Error("You can only edit your own pieces.");

    const path = `${context.userId}/${piece.id}.png`;
    const { error: upErr } = await context.supabase.storage
      .from("piece-images")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(upErr.message);

    const url = `/api/public/piece-img/${path}?v=${Date.now()}`;
    // Also patch the embedded def so games that snapshot the piece def
    // (sandbox saves, published games) keep the image when rendered later.
    const { data: existing } = await context.supabase
      .from("custom_pieces")
      .select("def")
      .eq("id", piece.id)
      .maybeSingle();
    const nextDef = {
      ...(existing?.def && typeof existing.def === "object" ? (existing.def as Record<string, unknown>) : {}),
      imageUrl: url,
    };
    const { error: updErr } = await context.supabase
      .from("custom_pieces")
      .update({ image_path: path, image_url: url, def: nextDef as never })
      .eq("id", piece.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true as const, imageUrl: url };
  });

export const clearPieceImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ pieceId: UuidSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: piece } = await context.supabase
      .from("custom_pieces")
      .select("id, image_path, author_id")
      .eq("id", data.pieceId)
      .maybeSingle();
    if (!piece || piece.author_id !== context.userId) throw new Error("Not allowed.");
    if (piece.image_path) {
      await context.supabase.storage.from("piece-images").remove([piece.image_path]);
    }
    const { error } = await context.supabase
      .from("custom_pieces")
      .update({ image_path: null, image_url: null })
      .eq("id", data.pieceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Forum showcase: anyone (signed-in) can create a topic for a piece ----------

export const createPieceShowcase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        pieceId: UuidSchema,
        title: z.string().trim().min(3).max(140),
        body: z.string().trim().min(1).max(8000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    // Verify piece exists & is public so showcase links work for everyone.
    const { data: piece, error: pErr } = await context.supabase
      .from("custom_pieces")
      .select("id, visibility")
      .eq("id", data.pieceId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!piece) throw new Error("Piece not found.");
    if (piece.visibility !== "public") throw new Error("Only public pieces can be showcased.");
    const { data: row, error } = await context.supabase
      .from("forum_topics")
      .insert({
        author_id: context.userId,
        title: data.title,
        body: data.body,
        shared_piece_id: data.pieceId,
        is_showcase: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/** Public list of recent showcases for a given piece — used on the detail page. */
export const listPieceShowcases = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ pieceId: UuidSchema }).parse(i))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: topics } = await sb
      .from("forum_topics")
      .select("id, title, reply_count, like_count, last_activity_at, author_id")
      .eq("shared_piece_id", data.pieceId)
      .order("last_activity_at", { ascending: false })
      .limit(20);
    return topics ?? [];
  });

// ---------- Special-ability requests ----------

const AbilityRequestInput = z.object({
  pieceId: UuidSchema,
  requestText: z.string().trim().min(3).max(800),
});

export const requestPieceAbility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AbilityRequestInput.parse(i))
  .handler(async ({ data, context }) => {
    // Verify caller owns the piece.
    const { data: piece, error: pErr } = await context.supabase
      .from("custom_pieces")
      .select("id, author_id")
      .eq("id", data.pieceId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!piece) throw new Error("Piece not found.");
    if (piece.author_id !== context.userId) throw new Error("You can only request abilities for your own pieces.");
    const { data: row, error } = await context.supabase
      .from("piece_ability_requests")
      .insert({
        piece_id: data.pieceId,
        author_id: context.userId,
        request_text: data.requestText,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const listMyAbilityRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("piece_ability_requests")
      .select("id, piece_id, request_text, status, admin_note, created_at, reviewed_at")
      .eq("author_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
