let migration: Promise<void> | undefined;

/** Remove retired feature data without changing manually saved cookie sessions. */
export function migrateStorage(): Promise<void> {
  migration ??= cleanStorage().catch((error) => {
    migration = undefined;
    throw error;
  });
  return migration;
}

async function cleanStorage(): Promise<void> {
  const data = await chrome.storage.local.get(null);
  if (data.cookieOnlyMigration === 1) return;
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const manual = sessions.filter((s: Record<string, unknown>) => s.automatic !== true)
    .map((s: Record<string, unknown>) => {
      const { automatic: _flag, authStorage: _storage, ...session } = s;
      return session;
    });
  await chrome.storage.local.set({ sessions: manual });
  const obsolete = Object.keys(data).filter(key => key === "switchJournal" ||
    key.startsWith("adapter:") || key.startsWith("active:"));
  if (obsolete.length) await chrome.storage.local.remove(obsolete);
  await chrome.storage.local.set({ cookieOnlyMigration: 1 });
}
