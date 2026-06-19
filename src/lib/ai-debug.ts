/**
 * AI debug surfacing. Tiny module so the worker request path can ask
 * "should we verify Zobrist + ship telemetry?" without dragging React in.
 *
 * Enabled when EITHER:
 *   - the URL has `?debug=ai` (or `?aiDebug=1`)
 *   - `localStorage.prismchess.aiDebug === "1"`
 *
 * Hitting either also persists the flag so a reload keeps it on.
 */
const LS_KEY = "prismchess.aiDebug";

function readUrlFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("aiDebug") === "1") return true;
    const d = sp.get("debug");
    if (d && d.split(",").map((s) => s.trim()).includes("ai")) return true;
    return false;
  } catch {
    return false;
  }
}

export function isAiDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(LS_KEY) === "1") return true;
  } catch { /* ignore */ }
  if (readUrlFlag()) {
    try { window.localStorage.setItem(LS_KEY, "1"); } catch { /* ignore */ }
    return true;
  }
  return false;
}

export function setAiDebugEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(LS_KEY, "1");
    else window.localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}
