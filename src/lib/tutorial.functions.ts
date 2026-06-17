import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SlideSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().max(800).optional(),
  bullets: z.array(z.string().max(200)).max(8).optional(),
  pieceId: z.string().max(4).optional(),
});

const TutorialSchema = z.object({
  slides: z.array(SlideSchema).min(3).max(12),
});

const DescriptionInput = z.object({
  name: z.string().min(1).max(80),
  pieceLegend: z.string().max(2000),
  rows: z.number().int().min(3).max(20),
  cols: z.number().int().min(3).max(20),
});

const TutorialInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000),
  pieceLegend: z.string().max(2000),
  rows: z.number().int().min(3).max(20),
  cols: z.number().int().min(3).max(20),
  customPieces: z
    .array(z.object({ id: z.string(), name: z.string(), description: z.string().optional() }))
    .max(20)
    .default([]),
});

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function extractJson(text: string): unknown | null {
  const cleaned = stripFences(text.trim());
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export const suggestGameDescription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DescriptionInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "AI is not configured." };
    try {
      const gateway = createLovableAiGatewayProvider(key);
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system:
          "You write short, punchy descriptions for chess variants (1–2 sentences, ≤220 chars). No markdown, no quotes around the result.",
        prompt: `Game name: ${data.name}\nBoard: ${data.rows}×${data.cols}\nPieces: ${data.pieceLegend}\n\nWrite a friendly description that hints at the variant's flavor without listing every rule.`,
        maxOutputTokens: 200,
      });
      const description = text.trim().replace(/^["'`]+|["'`]+$/g, "").slice(0, 240);
      return { ok: true as const, description };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/402/.test(msg)) return { ok: false as const, error: "AI credits exhausted. Add credits in Workspace → Usage." };
      if (/429/.test(msg)) return { ok: false as const, error: "AI rate limit hit — try again in a moment." };
      return { ok: false as const, error: "Couldn't generate a description right now." };
    }
  });

export const generateGameTutorial = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TutorialInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false as const, error: "AI is not configured." };

    const customList = data.customPieces.length
      ? data.customPieces
          .map((p) => `- [${p.id}] ${p.name}: ${p.description ?? "(no description)"}`)
          .join("\n")
      : "(none — all standard chess pieces)";

    const system = `You design first-time-player tutorials for a chess-variant app called Prism Chess.
Output ONLY a single JSON object — no markdown, no commentary — matching this exact shape:
{
  "slides": [
    { "title": "string", "body": "string (optional)", "bullets": ["string", ...] (optional), "pieceId": "string (optional, single-letter id of a custom piece if the slide explains one)" }
  ]
}

Rules:
- 5 to 8 slides total.
- Slide 1: a warm welcome to the named variant referencing the description.
- Then a "Board & setup" slide describing the starting position.
- Then ONE slide per non-standard custom piece present in the game, with the piece's id in "pieceId". Explain how it moves and captures in plain language a new player can act on.
- Then a "Win conditions & special rules" slide.
- Then a final "Tips for new players" slide (use 3–5 bullets).
- Keep each "body" under 500 chars. Keep titles short. Use no markdown formatting in any field.`;

    const prompt = `Variant name: ${data.name}
Board: ${data.rows}×${data.cols}
Author's description: ${data.description || "(none provided)"}

Pieces used in this variant (legend):
${data.pieceLegend}

Custom (non-standard) pieces in this game:
${customList}

Write the tutorial JSON now.`;

    try {
      const gateway = createLovableAiGatewayProvider(key);
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt,
        maxOutputTokens: 2200,
      });
      const parsed = extractJson(text);
      if (!parsed) return { ok: false as const, error: "AI returned unparseable tutorial." };
      const validated = TutorialSchema.safeParse(parsed);
      if (!validated.success) return { ok: false as const, error: "AI tutorial failed validation." };
      return { ok: true as const, slides: validated.data.slides };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/402/.test(msg)) return { ok: false as const, error: "AI credits exhausted. Add credits in Workspace → Usage." };
      if (/429/.test(msg)) return { ok: false as const, error: "AI rate limit hit — try again in a moment." };
      return { ok: false as const, error: "Couldn't generate a tutorial right now." };
    }
  });
