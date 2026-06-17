const KEY = "tutorials:seen";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as string[]) : [];
  } catch {
    return [];
  }
}

export function hasSeenTutorial(gameId: string): boolean {
  return read().includes(gameId);
}

export function markTutorialSeen(gameId: string) {
  if (typeof window === "undefined") return;
  const list = read();
  if (list.includes(gameId)) return;
  list.push(gameId);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

export function resetTutorialSeen(gameId: string) {
  if (typeof window === "undefined") return;
  const list = read().filter((id) => id !== gameId);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}
