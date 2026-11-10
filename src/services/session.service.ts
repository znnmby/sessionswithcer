import type { Session, NewSessionStatus } from "../types/session";
import { getCookiesForDomain, removeCookies, setCookies, cookieIdentity } from "./cookie.service";
import { saveSession, getSession, updateSession, getAllSessions } from "../storage/session.storage";
import { generateId } from "../utils/id";

let busy = false;
async function exclusive<T>(action: () => Promise<T>): Promise<T> {
  if (busy) throw new Error("Another session operation is running. Please wait.");
  busy = true;
  try { return await action(); } finally { busy = false; }
}
async function context(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url ?? "");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Open an HTTP(S) website first.");
  const store = (await chrome.cookies.getAllCookieStores()).find(s => s.tabIds.includes(tabId));
  if (!store) throw new Error("Cannot determine this tab's cookie store.");
  const partitionKey = chrome.cookies.getPartitionKey
    ? (await chrome.cookies.getPartitionKey({ tabId, frameId: 0 })).partitionKey : undefined;
  return { url, domain: url.hostname, storeId: store.id, partitionKey };
}
type Context = Awaited<ReturnType<typeof context>>;
async function snapshot(c: Context, label: string): Promise<Session> {
  const cookies = await getCookiesForDomain(c.domain, c.storeId, c.partitionKey);
  return { id: generateId(), label, domain: c.domain, url: c.url.href, storeId: c.storeId,
    cookies, cookieCount: cookies.length, savedAt: new Date().toISOString(), lastUsedAt: null };
}
export async function captureSession(label: string, tabId: number): Promise<Session> {
  return exclusive(async () => {
    const session = await snapshot(await context(tabId), label);
    await saveSession(session);
    await chrome.storage.local.remove(newSessionKey(tabId));
    return session;
  });
}
export async function recaptureSession(sessionId: string, tabId: number): Promise<Session> {
  return exclusive(async () => {
    const c = await context(tabId), saved = await getSession(sessionId);
    if (!saved || saved.domain !== c.domain || new URL(saved.url).origin !== c.url.origin)
      throw new Error("Select a session matching the current website and origin.");
    if (saved.storeId && saved.storeId !== c.storeId) throw new Error("Saved session belongs to another cookie store.");
    const fresh = await snapshot(c, saved.label);
    const updated = { ...fresh, id: saved.id, lastUsedAt: saved.lastUsedAt };
    await updateSession(sessionId, updated);
    return updated;
  });
}
export async function restoreSession(sessionId: string, tabId: number): Promise<void> {
  return exclusive(async () => {
    const c = await context(tabId), target = await getSession(sessionId);
    if (!target || target.domain !== c.domain || new URL(target.url).origin !== c.url.origin)
      throw new Error("Open the saved session's website and origin first.");
    if (target.storeId && target.storeId !== c.storeId) throw new Error("Saved session belongs to another cookie store.");
    for (const cookie of target.cookies) {
      const host = cookie.domain.replace(/^\./, "");
      if (!(host === c.domain || (!cookie.hostOnly && c.domain.endsWith(`.${host}`))))
        throw new Error("Saved cookie is outside the target website scope.");
      if (cookie.storeId && cookie.storeId !== c.storeId) throw new Error("Cookie store mismatch.");
      if (cookie.expirationDate !== undefined && cookie.expirationDate <= Date.now()/1000)
        throw new Error("Saved cookie has expired. Choose a newer session or sign in again.");
      if (cookie.partitionKey && (cookie.partitionKey.topLevelSite !== c.partitionKey?.topLevelSite ||
        (cookie.partitionKey.hasCrossSiteAncestor ?? false) !== (c.partitionKey?.hasCrossSiteAncestor ?? false)))
        throw new Error("Partitioned cookie context differs or is unsupported by this browser.");
    }
    const previous = await getCookiesForDomain(c.domain, c.storeId, c.partitionKey);
    await replaceCookies(c, tabId, previous, target.cookies, async () => {
      await updateSession(sessionId, { lastUsedAt: new Date().toISOString() });
      await chrome.storage.local.remove(newSessionKey(tabId));
    });
  });
}

// Shared by Switch and New. Failed changes restore the previous cookie state.
async function replaceCookies(c: Context, tabId: number, previous: Session["cookies"],
  target: Session["cookies"], onApplied: () => Promise<void>) {
  const current = await context(tabId);
  if (current.url.origin !== c.url.origin || current.storeId !== c.storeId)
    throw new Error("Website changed before cookies could be switched.");
  try {
    await removeCookies(previous);
    await setCookies(target, c.storeId);
    await chrome.tabs.reload(tabId);
    await onApplied();
  } catch {
    try {
      await removeCookies(await getCookiesForDomain(c.domain, c.storeId, c.partitionKey));
      await setCookies(previous, c.storeId);
      const currentTab = await context(tabId);
      if (currentTab.url.origin === c.url.origin) await chrome.tabs.reload(tabId);
    } catch { throw new Error("Switch failed; previous cookies could not be fully restored. Choose the saved session to retry."); }
    throw new Error("Switch failed. Previous cookies restored.");
  }
}
const newSessionKey = (tabId: number) => `newSession:${tabId}`;
export async function getNewSessionStatus(tabId: number): Promise<NewSessionStatus | null> {
  const c = await context(tabId), key = newSessionKey(tabId);
  const value = (await chrome.storage.local.get(key))[key] as NewSessionStatus | undefined;
  return value?.origin === c.url.origin && value.storeId === c.storeId ? value : null;
}

export async function createNewSession(label: string, tabId: number): Promise<NewSessionStatus> {
  return exclusive(async () => {
    if (typeof label !== "string") throw new Error("Invalid session label.");
    const c = await context(tabId);
    const pending = await getNewSessionStatus(tabId);
    if (pending) throw new Error("New session already started. Sign in and Save, or Switch to a saved account first.");
    const previous = await snapshot(c, label.trim() || `${c.domain} — ${new Date().toLocaleString()}`);
    if (!previous.cookies.length) throw new Error("No site cookies to preserve. Sign in to the new account, then use Save.");
    // Reuse an identical saved account only when no new label was requested.
    const signature = (cookies: Session["cookies"]) => JSON.stringify(cookies.map(cookie =>
      JSON.stringify([cookieIdentity(cookie), cookie.value, cookie.expirationDate,
        cookie.hostOnly, cookie.secure, cookie.httpOnly, cookie.sameSite])).sort());
    const existing = !label.trim() ? (await getAllSessions()).find(session =>
      session.domain === c.domain && new URL(session.url).origin === c.url.origin &&
      (!session.storeId || session.storeId === c.storeId) && signature(session.cookies) === signature(previous.cookies)) : undefined;
    const saved = existing ?? previous;
    // Never clear browser cookies until the current account snapshot is persisted.
    if (!existing) await saveSession(saved);
    const key = newSessionKey(tabId);
    const status: NewSessionStatus = { sessionId: saved.id, savedLabel: saved.label,
      origin: c.url.origin, storeId: c.storeId, ready: false };
    await chrome.storage.local.set({ [key]: status });
    try {
      await replaceCookies(c, tabId, previous.cookies, [], async () => {
        status.ready = true;
        await chrome.storage.local.set({ [key]: status });
      });
      return status;
    } catch (error) {
      await chrome.storage.local.remove(key);
      throw error;
    }
  });
}
