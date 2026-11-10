import type { Session } from "../types/session";

const STORAGE_KEY = "sessions";
let writes: Promise<unknown> = Promise.resolve();
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = writes.then(action, action);
  writes = next.catch(() => {});
  return next;
}

/**
 * Get all stored sessions.
 */
export async function getAllSessions(): Promise<Session[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as Session[]) ?? [];
}

/**
 * Get sessions filtered by domain.
 */
export async function getSessionsByDomain(
  domain: string,
): Promise<Session[]> {
  const sessions = await getAllSessions();
  return sessions.filter((s) => s.domain === domain);
}

/**
 * Save a new session (appends to the array).
 */
export async function saveSession(session: Session): Promise<void> {
  return serialize(async () => {
    const sessions = await getAllSessions();
    sessions.push(session);
    await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
  });
}

/**
 * Delete a session by its ID.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  return serialize(async () => {
    const sessions = await getAllSessions();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  });
}

/**
 * Update a session (partial merge by ID).
 */
export async function updateSession(
  sessionId: string,
  updates: Partial<Session>,
): Promise<void> {
  return serialize(async () => {
    const sessions = await getAllSessions();
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) throw new Error(`Session ${sessionId} not found`);
    sessions[idx] = { ...sessions[idx], ...updates };
    await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
  });
}

/**
 * Get a single session by ID.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const sessions = await getAllSessions();
  return sessions.find((s) => s.id === sessionId) ?? null;
}

/**
 * Import sessions, skipping any whose ID already exists.
 * Returns count of imported and skipped.
 */
export async function bulkImportSessions(
  incoming: Session[],
): Promise<{ imported: number; skipped: number }> {
  return serialize(async () => {
    const existing = await getAllSessions();
    const existingIds = new Set(existing.map((s) => s.id));

    let imported = 0;
    let skipped = 0;

    for (const session of incoming) {
      if (existingIds.has(session.id)) {
        skipped++;
      } else {
        existing.push(session);
        existingIds.add(session.id);
        imported++;
      }
    }

    await chrome.storage.local.set({ [STORAGE_KEY]: existing });
    return { imported, skipped };
  });
}
