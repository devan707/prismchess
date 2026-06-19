// Versions for Terms of Service and Privacy Policy. Bump these (ISO date)
// whenever the legal copy changes; the app uses them to track what each user
// has accepted and to prompt for re-consent on a future version bump.
export const TOS_VERSION = "2026-06-19";
export const PRIVACY_VERSION = "2026-06-19";

/** Display label, e.g. "Terms v2026-06-19". */
export function legalVersionLabel(prefix: string, version: string): string {
  return `${prefix} v${version}`;
}

/** Reserved usernames — handles we never let real users claim, either because
 * they imply official status or are obvious profanity. Server-side enforced. */
export const RESERVED_USERNAMES = new Set<string>([
  // Official / role names
  "admin", "administrator", "root", "support", "help", "contact", "staff",
  "moderator", "mod", "system", "owner", "team",
  // Brand
  "prism", "prismchess", "prism_chess", "official",
  // Generic
  "anonymous", "anon", "guest", "user", "you", "me", "null", "undefined",
  // Routes / paths we use
  "auth", "login", "logout", "signup", "signin", "onboarding", "profile",
  "settings", "lobby", "play", "create", "discover", "more", "forum", "terms",
  "privacy", "messages", "friends", "history", "multiplayer", "sandbox",
  "pieces", "api",
  // Obvious slurs / vulgarities (short non-exhaustive list)
  "fuck", "shit", "bitch", "cunt", "nigger", "faggot", "asshole",
]);

const RESERVED_SUBSTRINGS = ["nigger", "faggot", "kike", "tranny"];

export function isReservedUsername(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (RESERVED_USERNAMES.has(n)) return true;
  return RESERVED_SUBSTRINGS.some((s) => n.includes(s));
}
