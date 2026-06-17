// Chess/prism themed name generator for onboarding suggestions.
const ADJECTIVES = [
  "swift", "silent", "prism", "violet", "crimson", "azure", "golden", "obsidian",
  "sly", "bold", "clever", "wandering", "noble", "shadow", "rogue", "iron",
  "emerald", "stormy", "cosmic", "lucid", "vivid", "twilight", "amber", "frost",
];

const NOUNS = [
  "knight", "bishop", "rook", "pawn", "queen", "king", "dragon", "archer",
  "juggernaut", "necromancer", "gambit", "castle", "checkmate", "tempo",
  "fianchetto", "endgame", "opening", "zugzwang", "prism", "oracle",
  "wizard", "duelist", "tactician", "strategist",
];

const randomOf = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export function suggestUsername(): string {
  const adj = randomOf(ADJECTIVES);
  const noun = randomOf(NOUNS);
  const n = Math.floor(Math.random() * 900) + 100;
  return `${adj}_${noun}_${n}`;
}

export function suggestDisplayName(username: string): string {
  // Title-case the adj + noun part, drop the number suffix.
  const [adj, noun] = username.split("_");
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  return `${cap(adj)} ${cap(noun)}`;
}
