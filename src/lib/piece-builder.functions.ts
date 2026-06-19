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

// ---------- AI: generate technical movement/attack summary ----------

async function generateMovementSummaryFromDef(opts: {
  name: string;
  def: unknown;
}): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system:
        "You are a chess piece analyst. Given a custom chess piece definition (JSON), " +
        "write a concise TECHNICAL summary of how the piece MOVES and ATTACKS. " +
        "Cover: leaps vs slides, range, directions (forward / sideways / diagonal / backward), " +
        "whether captures and quiet moves use the same pattern or differ, any ranged or special " +
        "captures, and any conditional moves (e.g. first-move only, only when adjacent to friend). " +
        "Use chess vocabulary players know. 2-4 short sentences. No marketing language, no piece " +
        "names from classical chess unless directly comparable, no markdown, no bullet points, no headings.",
      prompt:
        `Piece name: ${opts.name}\n` +
        `Definition JSON:\n${JSON.stringify(opts.def, null, 2)}`,
      maxOutputTokens: 400,
    });
    const cleaned = text.trim().replace(/^["']+|["']+$/g, "").slice(0, 1200);
    return cleaned || null;
  } catch {
    return null;
  }
}

// ---------- Save / publish a custom piece ----------

const SaveInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(400).default(""),
  def: PieceDefJson,
  visibility: z.enum(["private", "public"]),
  remixedFromId: UuidSchema.nullable().optional(),
});

export const savePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveInput.parse(i))
  .handler(async ({ data, context }) => {
    const movementSummary = await generateMovementSummaryFromDef({
      name: data.name,
      def: data.def,
    });
    const defWithSummary = movementSummary
      ? { ...data.def, movementSummary }
      : data.def;
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = slugify(data.name);
      const { data: row, error } = await context.supabase
        .from("custom_pieces")
        .insert({
          author_id: context.userId,
          slug,
          name: data.name,
          description: data.description,
          def: defWithSummary as never,
          visibility: data.visibility,
          remixed_from_id: data.remixedFromId ?? null,
          movement_summary: movementSummary,
        })
        .select("id, slug")
        .single();
      if (!error) return row;
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("Could not generate a unique link. Please try again.");
  });

// ---------- Update an existing custom piece (owner only) ----------
//
// In-place edit. After the row is updated we also walk the author's OWN
// published games and rewrite any embedded copy of this piece in their
// `design.customPieces` so their published variants reflect the new design.
// Other people's published games keep their frozen snapshot — we never touch
// rows owned by someone else.

const UpdateInput = z.object({
  pieceId: UuidSchema,
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(400).default(""),
  def: PieceDefJson,
  visibility: z.enum(["private", "public"]),
});

export const updatePiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: existing, error: ownErr } = await context.supabase
      .from("custom_pieces")
      .select("id, author_id, image_url, def")
      .eq("id", data.pieceId)
      .maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    if (!existing) throw new Error("Piece not found.");
    if (existing.author_id !== context.userId) throw new Error("You can only edit your own pieces.");

    const defWithImage = existing.image_url
      ? { ...data.def, imageUrl: existing.image_url }
      : data.def;

    const movementSummary = await generateMovementSummaryFromDef({
      name: data.name,
      def: defWithImage,
    });
    const defWithSummary = movementSummary
      ? { ...defWithImage, movementSummary }
      : defWithImage;

    const { data: row, error } = await context.supabase
      .from("custom_pieces")
      .update({
        name: data.name,
        description: data.description,
        def: defWithSummary as never,
        visibility: data.visibility,
        movement_summary: movementSummary,
      })
      .eq("id", data.pieceId)
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);

    // Pull the engine-facing piece id out of the def (e.g. "u:abc123"). That is
    // what's stored in design.customPieces[*].id — not the row UUID.
    const enginePieceId = (defWithSummary as { id?: unknown }).id;
    let refreshedGames = 0;
    if (typeof enginePieceId === "string" && enginePieceId.length > 0) {
      const { data: myGames } = await context.supabase
        .from("published_games")
        .select("id, design")
        .eq("author_id", context.userId);
      for (const g of myGames ?? []) {
        const design = g.design as { customPieces?: Array<{ id?: string }> } | null;
        if (!design || !Array.isArray(design.customPieces)) continue;
        let touched = false;
        const nextPieces = design.customPieces.map((p) => {
          if (p && p.id === enginePieceId) { touched = true; return defWithSummary; }
          return p;
        });
        if (!touched) continue;
        const nextDesign = { ...design, customPieces: nextPieces };
        const { error: upErr } = await context.supabase
          .from("published_games")
          .update({ design: nextDesign as never, updated_at: new Date().toISOString() })
          .eq("id", g.id)
          .eq("author_id", context.userId);
        if (!upErr) refreshedGames += 1;
      }
    }
    return { ...row, refreshedGames };
  });

// ---------- Get one of my pieces (by slug) for duplication/forking or editing ----------

export const getMyPieceBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: z.string().trim().min(1).max(60) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("custom_pieces")
      .select("id, slug, name, description, def, visibility, image_url, author_id, movement_summary")
      .eq("slug", data.slug)
      .eq("author_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- List queries ----------

const PIECE_COLS = "id, slug, name, description, def, visibility, like_count, created_at, author_id, image_url, movement_summary";

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
      .select("id, slug, name, description, def, visibility, like_count, created_at, author_id, image_url, is_hidden, movement_summary")
      .in("id", ids);
    if (piecesErr) throw new Error(piecesErr.message);
    type Row = {
      id: string; slug: string; name: string; description: string;
      def: import("@/integrations/supabase/types").Json; visibility: string;
      like_count: number; created_at: string; author_id: string;
      image_url: string | null; is_hidden: boolean; movement_summary: string | null;
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
      image_url: string | null; movement_summary: string | null;
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
      .select("id, slug, name, description, def, visibility, like_count, created_at, author_id, image_url, is_hidden, remixed_from_id, movement_summary")
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
      remixed_from_id: string | null; movement_summary: string | null;
    };
    const { data: prof } = await sb
      .from("profiles")
      .select("username, display_name")
      .eq("id", typedRow.author_id)
      .maybeSingle();
    // Look up the remix origin (only if still public/visible) for credit display.
    let remixedFrom: { slug: string; name: string; author: { username: string; display_name: string | null } | null } | null = null;
    if (typedRow.remixed_from_id) {
      const { data: orig } = await sb
        .from("custom_pieces")
        .select("slug, name, author_id, visibility, is_hidden")
        .eq("id", typedRow.remixed_from_id)
        .maybeSingle();
      if (orig && orig.visibility === "public" && !orig.is_hidden) {
        const { data: origProf } = await sb
          .from("profiles").select("username, display_name").eq("id", orig.author_id).maybeSingle();
        remixedFrom = { slug: orig.slug, name: orig.name, author: (origProf ?? null) as { username: string; display_name: string | null } | null };
      }
    }
    return { ...typedRow, author: (prof ?? null) as { username: string; display_name: string | null } | null, remixedFrom };
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
