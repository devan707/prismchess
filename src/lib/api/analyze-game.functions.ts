import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const PlaybookSchema = z.object({
  lessons: z.array(z.string()).max(24),
  pieceValueMultipliers: z.record(z.string(), z.number()).default({}),
  cautionMultiplier: z.number(),
  aggressionBonus: z.number(),
  gamesReviewed: z.number().int().nonnegative(),
});

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const InputSchema = z.object({
  design: z.object({
    name: z.string().default("Custom"),
    rows: z.number().int(),
    cols: z.number().int(),
    pieceLegend: z.string(), // "P=Pawn, W=Wizard, ..."
  }),
  aiSide: z.enum(["w", "b"]),
  aiDifficulty: z.enum(["easy", "medium", "hard"]),
  outcome: z.enum(["aiWon", "aiLost", "draw", "unknown"]),
  moves: z.array(z.string()).max(400),
  currentPlaybook: PlaybookSchema,
  priorTurns: z.array(TurnSchema).max(20).default([]),
  userMessage: z.string().max(2000).optional(),
});

const OutputSchema = z.object({
  analysis: z.string().describe("Conversational analysis or response addressed to the human, in markdown. Reference specific moves when possible."),
  updatedPlaybook: z.object({
    lessons: z.array(z.string().max(280)).max(24).describe(
      "The full updated list of compact playing lessons the AI should remember next game. Keep durable rules; drop stale ones; max 24.",
    ),
    pieceValueMultipliers: z
      .record(z.string(), z.number().min(0.3).max(2.5))
      .describe("Map of piece id (e.g. 'W','D','M') to a multiplier on its base value. Only include pieces you want to adjust."),
    cautionMultiplier: z.number().min(0.3).max(2.5).describe("Multiplier on the hanging-piece penalty. >1 makes the AI more cautious, <1 more reckless."),
    aggressionBonus: z.number().min(-150).max(150).describe("Centipawn bonus added to every capturing move. Positive = bias toward trades."),
  }),
});

function fmtSq(sq: { r: number; c: number } | null | undefined, _cols: number): string {
  if (!sq) return "*";
  const file = "abcdefghijkl"[sq.c] ?? "?";
  return `${file}${sq.r + 1}`;
}

interface MoveLike {
  from?: { r: number; c: number } | null;
  to?: { r: number; c: number };
  piece?: { id: string; color: "w" | "b" };
  captured?: { id: string } | null;
  kind?: string;
  promotion?: string;
  dropPieceId?: string;
  resurrectPieceId?: string;
  juggTrampled?: { id: string }[];
}

/** Serialize one Move into a compact human-readable string. */
export function fmtMove(m: MoveLike, cols: number, ply: number): string {
  const color = m.piece?.color === "w" ? "W" : "B";
  const pid = m.piece?.id ?? "?";
  const from = fmtSq(m.from ?? null, cols);
  const to = fmtSq(m.to ?? null, cols);
  const cap = m.captured ? `x${m.captured.id}` : "";
  let extra = "";
  if (m.promotion) extra += `=${m.promotion}`;
  if (m.kind === "drop" && m.dropPieceId) extra += `[drop ${m.dropPieceId}]`;
  if (m.kind === "resurrect" && m.resurrectPieceId) extra += `[res ${m.resurrectPieceId}]`;
  if (m.kind === "juggCharge") extra += "[charge]";
  if (m.kind === "juggShift") extra += "[shift]";
  if (m.juggTrampled?.length) extra += `[trample ${m.juggTrampled.map((t) => t.id).join(",")}]`;
  return `${ply}. ${color}${pid} ${from}→${to}${cap}${extra}`;
}

const SYSTEM_PROMPT = `You are the strategic brain that coaches the AI opponent in a custom chess variant called The Grand Menagerie.

You will receive:
- A piece legend describing standard pieces and custom pieces (Wizard, Dragon, Necromancer, Assassin, Juggernaut, Archer, Portal, King's Hand, Shapeshifter Pawn, Barricade).
- A full move list from a recently-completed game.
- The current "playbook" — natural-language lessons plus tunable numeric weights that the minimax engine uses (piece value multipliers, caution, aggression).
- Optional human feedback from the developer/user.

Your job:
1. Briefly analyze the game in the "analysis" field (markdown, friendly tone). Cite move numbers when discussing mistakes/highlights. If there's a human message in priorTurns, treat this as a continuing conversation and respond accordingly.
2. Produce an UPDATED full playbook. Improve it incrementally — keep what still applies, add new lessons learned from this game/feedback, drop redundancies. Never wipe lessons unless they directly conflict with new evidence.
3. Adjust numeric weights conservatively:
   - pieceValueMultipliers: only override pieces whose true value the engine seems to be mis-estimating. e.g. if the AI keeps trading its Wizard for pawns, the Wizard multiplier should rise.
   - cautionMultiplier: raise if the AI hung valuable pieces; lower if it played too passively.
   - aggressionBonus: positive if the AI missed clearly good trades; negative if it traded too greedily.
4. Keep lessons short, imperative, piece-specific where possible. Example: "Never move the Wizard adjacent to an Assassin's launch diagonal."
5. If the user explicitly asks you to forget or change something, honor it.`;

export const analyzeGame = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const outcomeLabel =
      data.outcome === "aiWon" ? "The AI won."
        : data.outcome === "aiLost" ? "The AI lost."
          : data.outcome === "draw" ? "Drawn game."
            : "Outcome unknown / game still in progress.";

    const playbookJson = JSON.stringify(data.currentPlaybook, null, 2);
    const movesList = data.moves.length
      ? data.moves.join("\n")
      : "(no moves played)";

    const promptParts = [
      `Game: ${data.design.name} (${data.design.rows}×${data.design.cols} board)`,
      `Piece legend:\n${data.design.pieceLegend}`,
      `AI played: ${data.aiSide === "w" ? "White" : "Black"} on ${data.aiDifficulty} difficulty.`,
      outcomeLabel,
      `Current playbook (JSON):\n${playbookJson}`,
      `Move list:\n${movesList}`,
    ];
    if (data.userMessage) {
      promptParts.push(`User message:\n${data.userMessage}`);
    }

    const conversation = data.priorTurns.map((t) => ({ role: t.role, content: t.content } as const));
    conversation.push({ role: "user" as const, content: promptParts.join("\n\n") });

    const jsonInstruction = `Respond with ONLY a single JSON object (no markdown, no prose around it) matching this shape exactly:
{
  "analysis": "markdown string addressed to the developer",
  "updatedPlaybook": {
    "lessons": ["short imperative lesson", ...],   // up to 24 strings, each <=280 chars
    "pieceValueMultipliers": { "<pieceId>": <number 0.3..2.5>, ... },
    "cautionMultiplier": <number 0.3..2.5>,
    "aggressionBonus": <number -150..150>
  }
}`;
    const lastUser = conversation[conversation.length - 1];
    lastUser.content = `${lastUser.content}\n\n${jsonInstruction}`;

    try {
      const { text } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: conversation,
        maxOutputTokens: 4096,
      });
      const parsed = extractAndValidate(text, data.currentPlaybook);
      if (!parsed.ok) {
        return { ok: false as const, code: 500, error: parsed.error };
      }
      return { ok: true as const, analysis: parsed.analysis, updatedPlaybook: parsed.updatedPlaybook };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/402/.test(msg)) return { ok: false as const, code: 402, error: "AI credits exhausted. Add credits in Workspace → Usage." };
      if (/429/.test(msg)) return { ok: false as const, code: 429, error: "AI rate limit hit. Try again in a moment." };
      return { ok: false as const, code: 500, error: msg };
    }
  });

/** Strip code fences and locate the first balanced JSON object in the text. */
function extractJsonString(text: string): string | null {
  let s = text.trim();
  // Remove ```json ... ``` or ``` ... ``` fences.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
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
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function extractAndValidate(
  text: string,
  current: z.infer<typeof PlaybookSchema>,
):
  | { ok: true; analysis: string; updatedPlaybook: z.infer<typeof OutputSchema>["updatedPlaybook"] }
  | { ok: false; error: string } {
  const jsonStr = extractJsonString(text);
  if (!jsonStr) {
    return { ok: false, error: "AI response was not valid JSON. Try again." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, error: `AI returned malformed JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  // Lenient normalization — keep current values if AI omitted/garbled a field.
  const obj = (raw ?? {}) as Record<string, unknown>;
  const analysis = typeof obj.analysis === "string" && obj.analysis.trim().length > 0
    ? obj.analysis
    : "(The AI didn't return any commentary this round.)";
  const upRaw = (obj.updatedPlaybook ?? {}) as Record<string, unknown>;
  const clampNum = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  const lessons = Array.isArray(upRaw.lessons)
    ? (upRaw.lessons as unknown[])
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((s) => s.slice(0, 280))
        .slice(0, 24)
    : current.lessons;
  const multsRaw = (upRaw.pieceValueMultipliers ?? {}) as Record<string, unknown>;
  const pieceValueMultipliers: Record<string, number> = {};
  for (const [k, v] of Object.entries(multsRaw)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      pieceValueMultipliers[k] = Math.max(0.3, Math.min(2.5, v));
    }
  }
  const updatedPlaybook = {
    lessons,
    pieceValueMultipliers: Object.keys(pieceValueMultipliers).length
      ? pieceValueMultipliers
      : current.pieceValueMultipliers,
    cautionMultiplier: clampNum(upRaw.cautionMultiplier, 0.3, 2.5, current.cautionMultiplier),
    aggressionBonus: clampNum(upRaw.aggressionBonus, -150, 150, current.aggressionBonus),
  };
  return { ok: true, analysis, updatedPlaybook };
}
