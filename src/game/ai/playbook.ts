/**
 * Persistent "playbook" the AI uses across games. Lessons are natural-language
 * reminders that future analysis chats see; tweaks are numeric weights that
 * the minimax evaluator applies on every move.
 *
 * v2: keyed per-variant in localStorage so what the AI learns playing
 * Menagerie doesn't bleed into Grand Menagerie / sandbox / custom boards.
 * v1 → v2 migration runs once per browser; the legacy global blob is
 * dropped into whatever variant is loaded the first time the page boots.
 */
export interface OpeningBookEntry { plays: number; wins: number }
export interface Playbook {
  lessons: string[];
  pieceValueMultipliers: Record<string, number>;
  cautionMultiplier: number;
  aggressionBonus: number;
  squareDefenseBonuses: Record<string, number>;
  gamesReviewed: number;
  /** Cloud-synced opening lines (per variant). Key = "pid@toRC|pid@toRC|...".
   *  Used to bias the AI toward openings that have won across all players. */
  openingBook?: Record<string, OpeningBookEntry>;
  /** How aggressively to apply cloud adjustments (0..1). Easy < Med < Hard. */
  cloudScale?: number;
}

const V1_KEY = "menagerie.ai.playbook.v1";
const V2_PREFIX = "menagerie.ai.playbook.v2:";
const V3_PREFIX = "menagerie.ai.playbook.v3:";
const DEFAULT_VARIANT = "__default__";

export const DEFAULT_PLAYBOOK: Playbook = {
  lessons: [],
  pieceValueMultipliers: {},
  cautionMultiplier: 1,
  aggressionBonus: 0,
  squareDefenseBonuses: {},
  gamesReviewed: 0,
};

function clampMult(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0.3, Math.min(2.5, v));
}

export function normalizePlaybook(p: Partial<Playbook> | null | undefined): Playbook {
  const base: Playbook = {
    ...DEFAULT_PLAYBOOK,
    pieceValueMultipliers: { ...DEFAULT_PLAYBOOK.pieceValueMultipliers },
    squareDefenseBonuses: { ...DEFAULT_PLAYBOOK.squareDefenseBonuses },
  };
  if (!p) return base;
  if (Array.isArray(p.lessons)) {
    base.lessons = p.lessons.filter((l): l is string => typeof l === "string" && l.trim().length > 0).slice(0, 24);
  }
  if (p.pieceValueMultipliers && typeof p.pieceValueMultipliers === "object") {
    for (const [k, v] of Object.entries(p.pieceValueMultipliers)) {
      if (typeof v === "number") base.pieceValueMultipliers[k] = clampMult(v);
    }
  }
  if (p.squareDefenseBonuses && typeof p.squareDefenseBonuses === "object") {
    for (const [k, v] of Object.entries(p.squareDefenseBonuses)) {
      if (typeof v === "number" && Number.isFinite(v) && /^[a-l]\d{1,2}$/i.test(k)) {
        base.squareDefenseBonuses[k.toLowerCase()] = Math.max(-300, Math.min(300, v));
      }
    }
  }
  if (typeof p.cautionMultiplier === "number") base.cautionMultiplier = clampMult(p.cautionMultiplier);
  if (typeof p.aggressionBonus === "number") {
    base.aggressionBonus = Math.max(-150, Math.min(150, p.aggressionBonus));
  }
  if (typeof p.gamesReviewed === "number" && p.gamesReviewed >= 0) {
    base.gamesReviewed = Math.floor(p.gamesReviewed);
  }
  return base;
}

function keyFor(variantKey?: string | null): string {
  const k = (variantKey ?? DEFAULT_VARIANT).trim() || DEFAULT_VARIANT;
  return V3_PREFIX + k;
}

/**
 * v2 → v3 migration. The point-value system changed under the AI's feet, so
 * we discard everything except positional/opening preferences
 * (`squareDefenseBonuses`). Old lessons, learned value multipliers, caution,
 * and aggression weights are all reset.
 */
function migrateLegacyOnce(targetVariant: string): void {
  if (typeof window === "undefined") return;
  try {
    const tgtKey = keyFor(targetVariant);
    if (window.localStorage.getItem(tgtKey)) return; // already migrated
    const v2Key = V2_PREFIX + ((targetVariant ?? DEFAULT_VARIANT).trim() || DEFAULT_VARIANT);
    const v2Raw = window.localStorage.getItem(v2Key) ?? window.localStorage.getItem(V1_KEY);
    if (!v2Raw) return;
    let parsed: Partial<Playbook> | null = null;
    try { parsed = JSON.parse(v2Raw) as Partial<Playbook>; } catch { parsed = null; }
    const carried: Partial<Playbook> = {
      squareDefenseBonuses: parsed?.squareDefenseBonuses ?? {},
    };
    const migrated = normalizePlaybook(carried);
    window.localStorage.setItem(tgtKey, JSON.stringify(migrated));
  } catch { /* noop */ }
}

const cache = new Map<string, Playbook>();

/** Resolve current variant from session storage (set by the design loader). */
function currentVariantKey(): string {
  if (typeof window === "undefined") return DEFAULT_VARIANT;
  try {
    const raw = window.sessionStorage.getItem("designer:currentMeta");
    if (!raw) return DEFAULT_VARIANT;
    const meta = JSON.parse(raw) as { id?: string };
    return meta?.id || DEFAULT_VARIANT;
  } catch { return DEFAULT_VARIANT; }
}

export function loadPlaybook(variantKey?: string): Playbook {
  const vk = variantKey ?? currentVariantKey();
  if (cache.has(vk)) return cache.get(vk)!;
  migrateLegacyOnce(vk);
  if (typeof window === "undefined") return DEFAULT_PLAYBOOK;
  try {
    const raw = window.localStorage.getItem(keyFor(vk));
    const pb = normalizePlaybook(raw ? JSON.parse(raw) : null);
    cache.set(vk, pb);
    return pb;
  } catch {
    const pb = { ...DEFAULT_PLAYBOOK };
    cache.set(vk, pb);
    return pb;
  }
}

export function savePlaybook(p: Playbook, variantKey?: string): void {
  const vk = variantKey ?? currentVariantKey();
  const normalized = normalizePlaybook(p);
  cache.set(vk, normalized);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(vk), JSON.stringify(normalized));
  } catch { /* ignore quota */ }
}

export function resetPlaybook(variantKey?: string): Playbook {
  const vk = variantKey ?? currentVariantKey();
  const fresh = { ...DEFAULT_PLAYBOOK, pieceValueMultipliers: {}, squareDefenseBonuses: {} };
  cache.set(vk, fresh);
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(keyFor(vk)); } catch { /* noop */ }
  }
  return fresh;
}

/** Wipe every per-variant playbook. */
export function resetAllPlaybooks(): void {
  cache.clear();
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith(V3_PREFIX) || k.startsWith(V2_PREFIX) || k === V1_KEY)) toRemove.push(k);
    }
    for (const k of toRemove) window.localStorage.removeItem(k);
  } catch { /* noop */ }
}

// ---------- worker snapshot plumbing ----------
//
// The search runs in a Web Worker (no window/localStorage), so the main
// thread snapshots the current variant's playbook before each request and the
// worker calls setActivePlaybookSnapshot() on receipt. evaluate() reads
// through getActivePlaybook(), which prefers the snapshot when one is set.

let activeSnapshot: Playbook | null = null;

export function setActivePlaybookSnapshot(p: Playbook | null): void {
  activeSnapshot = p ? normalizePlaybook(p) : null;
}

export function getActivePlaybook(): Playbook {
  if (activeSnapshot) return activeSnapshot;
  return loadPlaybook();
}

// ---------- cloud-synced learning ----------
//
// Cloud aggregates (from src/lib/ai-learning.functions.ts) are merged into a
// local playbook snapshot before each game. We derive:
//   * pieceValueMultipliers — pieces whose trades correlate with AI wins get
//     valued slightly higher; pieces whose trades correlate with losses get
//     valued lower (so the engine protects them more / sacs them less).
//   * aggressionBonus — small nudge based on overall win rate.
//   * openingBook — carried through so search.ts can bias the root.
//
// Cloud values are scaled by `difficultyScale` (Easy: 0.25, Med: 0.6,
// Hard: 1.0) so beginner mode stays beatable.

export interface CloudAggregates {
  games: number;
  aiWins: number;
  aiLosses: number;
  aiDraws: number;
  pieceTradeOutcomes: Record<string, { wins: number; losses: number; draws: number }>;
  openingBook: Record<string, OpeningBookEntry>;
}

export function mergeCloudPlaybook(
  base: Playbook,
  cloud: CloudAggregates | null,
  difficultyScale: number,
): Playbook {
  if (!cloud || cloud.games < 3) {
    // Not enough data to trust — leave defaults alone.
    return { ...base, openingBook: cloud?.openingBook, cloudScale: difficultyScale };
  }
  const scale = Math.max(0, Math.min(1, difficultyScale));
  const pieceMults = { ...base.pieceValueMultipliers };
  for (const [pid, t] of Object.entries(cloud.pieceTradeOutcomes ?? {})) {
    const total = t.wins + t.losses + t.draws;
    if (total < 4) continue;
    const winrate = (t.wins + t.draws * 0.5) / total;
    // Centre at 0.5 → multiplier in [0.75 .. 1.25] before scaling.
    const delta = (winrate - 0.5) * 0.5;
    const mult = 1 + delta * scale;
    pieceMults[pid] = clampMult((pieceMults[pid] ?? 1) * mult);
  }
  const totalGames = cloud.games;
  const overall = totalGames > 0 ? (cloud.aiWins + cloud.aiDraws * 0.5) / totalGames : 0.5;
  // -50..+50 cp aggression nudge based on how the AI is doing overall.
  const aggression = Math.round((overall - 0.5) * 100 * scale);
  return {
    ...base,
    pieceValueMultipliers: pieceMults,
    aggressionBonus: Math.max(-150, Math.min(150, base.aggressionBonus + aggression)),
    openingBook: cloud.openingBook ?? {},
    cloudScale: scale,
  };
}

export function difficultyCloudScale(d: "easy" | "medium" | "hard"): number {
  if (d === "easy") return 0.25;
  if (d === "medium") return 0.6;
  return 1.0;
}
