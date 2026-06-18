import type { Difficulty } from "@/game/types";

export interface PlayPrefs {
  difficulty: Difficulty;
  showHints: boolean;   // show legal-move dots on the board
  showTips: boolean;    // show the piece-info window
}

const KEY = "play:defaultPrefs";

export const DEFAULT_PREFS: PlayPrefs = {
  difficulty: "medium",
  showHints: true,
  showTips: true,
};

function clean(p: Partial<PlayPrefs> | null | undefined): PlayPrefs {
  const out: PlayPrefs = { ...DEFAULT_PREFS };
  if (!p) return out;
  if (p.difficulty === "easy" || p.difficulty === "medium" || p.difficulty === "hard") {
    out.difficulty = p.difficulty;
  }
  if (typeof p.showHints === "boolean") out.showHints = p.showHints;
  if (typeof p.showTips === "boolean") out.showTips = p.showTips;
  return out;
}

export function loadDefaultPrefs(): PlayPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return clean(JSON.parse(raw));
  } catch {}
  // One-time migration from older per-key flags so existing toggles aren't lost.
  try {
    const tips = localStorage.getItem("play:tips");
    return clean({
      showTips: tips === null ? true : tips !== "0",
    });
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveDefaultPrefs(p: PlayPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(clean(p))); } catch {}
}
