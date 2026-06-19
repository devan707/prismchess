/** Safely read a `redirect` URL search param. Only same-origin paths beginning
 *  with a single `/` are honored, to prevent open-redirect abuse. */
export function safeRedirectFromSearch(search?: string): string | null {
  try {
    const sp = new URLSearchParams(search ?? (typeof window === "undefined" ? "" : window.location.search));
    const raw = sp.get("redirect");
    if (!raw) return null;
    // Must be a path on this app — no protocol, no protocol-relative URL.
    if (!raw.startsWith("/") || raw.startsWith("//")) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Append ?redirect=<path> to a target path. */
export function withRedirect(target: string, redirect?: string | null): string {
  if (!redirect) return target;
  const sep = target.includes("?") ? "&" : "?";
  return `${target}${sep}redirect=${encodeURIComponent(redirect)}`;
}
