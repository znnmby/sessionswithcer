import type { Session } from "../types/session";
import { getCookiesForDomain, removeCookies, setCookies } from "./cookie.service";
import { saveSession, getSession, updateSession } from "../storage/session.storage";
import { generateId } from "../utils/id";
import { getAdapter, isAuthCookie, authStorage, verifyAuth } from "./auth-adapter.service";
import type { AuthAdapter, AnonymousStatus } from "../types/auth";

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
  return { tabId, url, domain: url.hostname, storeId: store.id, partitionKey };
}
type Context = Awaited<ReturnType<typeof context>>;
const stateKey = (c: Context) => `active:${c.storeId}:${c.url.origin}:${c.tabId}`;
async function snapshot(c: Context, label: string, adapter: AuthAdapter | null): Promise<Session> {
  const cookies = await getCookiesForDomain(c.domain, c.storeId, c.partitionKey);
  return { id: generateId(), label, domain: c.domain, url: c.url.href, storeId: c.storeId,
    cookies, cookieCount: cookies.length, savedAt: new Date().toISOString(), lastUsedAt: null,
    ...(adapter ? { authStorage: await authStorage(c.tabId, c.url.origin, adapter) } : {}) };
}

async function protectAnonymousSnapshot(c: Context, session: Session, adapter: AuthAdapter | null) {
  if (!adapter) return;
  const hasAuth = session.cookies.some(x => isAuthCookie(x, adapter)) ||
    Object.values(session.authStorage?.local ?? {}).some(v => v !== null) ||
    Object.values(session.authStorage?.session ?? {}).some(v => v !== null);
  const key = stateKey(c);
  const active = (await chrome.storage.local.get(key))[key] as AnonymousStatus | undefined;
  if (!hasAuth || active?.mode === "anonymous") {
    // A verifier can recognize a manual login after Anonymous was selected.
    if (active?.mode === "anonymous" && adapter.verification) {
      try { await verifyAuth(c.tabId, c.url.origin, adapter, false); return; } catch {}
    }
    throw new Error("Anonymous state cannot be captured over an account snapshot. Switch to an account or sign in first.");
  }
}

export async function captureSession(label: string, tabId: number): Promise<Session> {
  return exclusive(async () => {
    const c = await context(tabId);
    const session = await snapshot(c, label, await getAdapter(c.domain));
    await protectAnonymousSnapshot(c, session, await getAdapter(c.domain));
    await saveSession(session);
    return session;
  });
}
export async function recaptureSession(sessionId: string, tabId: number): Promise<Session> {
  return exclusive(async () => {
    const c = await context(tabId), saved = await getSession(sessionId);
    if (!saved || saved.domain !== c.domain) throw new Error("Select a session matching the current website.");
    if (saved.automatic) throw new Error("Recovery snapshots cannot be overwritten. Save a new session instead.");
    const fresh = await snapshot(c, saved.label, await getAdapter(c.domain));
    await protectAnonymousSnapshot(c, fresh, await getAdapter(c.domain));
    const updates = { ...fresh, id: saved.id, lastUsedAt: saved.lastUsedAt };
    await updateSession(sessionId, updates);
    return updates;
  });
}

function reloadAndWait(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener);
      error ? reject(error) : resolve();
    };
    const listener = (id: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && change.status === "complete") finish();
    };
    const timer = setTimeout(() => finish(new Error("Reload timed out.")), 15000);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(tabId).catch(() => finish(new Error("Cannot reload target tab.")));
  });
}
interface Journal { before: Session; adapter: AuthAdapter | null; tabId: number; key: string }
async function apply(c: Context, target: Session | null, adapter: AuthAdapter | null) {
  const current = await context(c.tabId);
  if (current.url.origin !== c.url.origin || current.storeId !== c.storeId)
    throw new Error("Website changed during switching.");
  const cookies = await getCookiesForDomain(c.domain, c.storeId, c.partitionKey);
  await removeCookies(adapter ? cookies.filter(x => isAuthCookie(x, adapter)) : cookies);
  await setCookies((target?.cookies ?? []).filter(x => !adapter || isAuthCookie(x, adapter)), c.storeId);
  if (adapter) await authStorage(c.tabId, c.url.origin, adapter, target?.authStorage ?? {
    origin: c.url.origin, local: {}, session: {},
  });
}
async function rollback(c: Context, journal: Journal) {
  await apply(c, journal.before, journal.adapter);
  await reloadAndWait(c.tabId);
  await chrome.storage.local.remove(journal.key);
  await chrome.storage.local.remove("switchJournal");
}
export async function recoverSwitch(tabId: number): Promise<void> {
  return exclusive(async () => {
    const { switchJournal: journal } = await chrome.storage.local.get("switchJournal") as { switchJournal?: Journal };
    if (!journal) throw new Error("No interrupted switch needs recovery.");
    const c = await context(tabId);
    if (c.url.origin !== new URL(journal.before.url).origin || c.storeId !== journal.before.storeId)
      throw new Error("Return to the original website and cookie store to recover.");
    await rollback(c, journal);
  });
}
export async function getAnonymousStatus(tabId: number): Promise<AnonymousStatus> {
  const c = await context(tabId), adapter = await getAdapter(c.domain);
  const key = stateKey(c);
  const data = await chrome.storage.local.get([key, "switchJournal"]);
  if (data.switchJournal) return { adapter, mode: "unknown", verification: "Interrupted switch: use Recover on the original website/store." };
  const active = data[key] as AnonymousStatus | undefined;
  if (!active) return { adapter, mode: "unknown", verification: "Current account has not been tracked." };
  try {
    const verification = adapter ? await verifyAuth(tabId, c.url.origin, adapter, active.mode === "anonymous") : "Unverified legacy cookie session.";
    return { ...active, adapter, verification };
  } catch {
    return { adapter, mode: "unknown", verification: "Authentication changed or could not be verified. Snapshot remains available." };
  }
}
async function switchTo(tabId: number, sessionId?: string): Promise<AnonymousStatus> {
  return exclusive(async () => {
    const c = await context(tabId), adapter = await getAdapter(c.domain);
    if ((await chrome.storage.local.get("switchJournal")).switchJournal)
      throw new Error("An interrupted switch needs recovery in its original tab first.");
    if (adapter && !c.partitionKey) throw new Error("Adapter switching requires Chrome 132+ partition-key support.");
    if (!sessionId && !adapter) throw new Error("Anonymous is unsupported until an authentication adapter is configured for this website.");
    const target = sessionId ? await getSession(sessionId) : null;
    if (sessionId && (!target || target.domain !== c.domain || new URL(target.url).origin !== c.url.origin))
      throw new Error("Open the saved session's website and origin first.");
    if (target?.authStorage && target.authStorage.origin !== c.url.origin) throw new Error("Authentication storage origin mismatch.");
    if (target?.storeId && target.storeId !== c.storeId) throw new Error("Saved session belongs to another cookie store.");
    for (const cookie of target?.cookies ?? []) {
      const host = cookie.domain.replace(/^\./, "");
      if (!(host === c.domain || (!cookie.hostOnly && c.domain.endsWith(`.${host}`))))
        throw new Error("Saved cookie is outside the target website scope.");
      if (cookie.storeId && cookie.storeId !== c.storeId) throw new Error("Cookie store mismatch.");
      if ((!adapter || isAuthCookie(cookie, adapter)) && cookie.expirationDate !== undefined && cookie.expirationDate <= Date.now()/1000)
        throw new Error("Saved authentication cookie has expired. Choose a newer snapshot or sign in again.");
      if (cookie.partitionKey && (cookie.partitionKey.topLevelSite !== c.partitionKey?.topLevelSite ||
        (cookie.partitionKey.hasCrossSiteAncestor ?? false) !== (c.partitionKey?.hasCrossSiteAncestor ?? false)))
        throw new Error("Partitioned cookie context differs or is unsupported by this browser.");
    }
    if (adapter && target && (adapter.localKeys.length || adapter.sessionKeys.length) && !target.authStorage)
      throw new Error("Legacy snapshot has no authentication storage. Update it while signed in before switching.");
    const before = await snapshot(c, `Recovery — ${new Date().toLocaleString()}`, adapter);
    let hasAuth = adapter ? before.cookies.some(x => isAuthCookie(x, adapter)) ||
      Object.values(before.authStorage!.local).some(x => x !== null) || Object.values(before.authStorage!.session).some(x => x !== null)
      : before.cookies.length > 0;
    if (adapter?.verification) {
      try { await verifyAuth(tabId, c.url.origin, adapter, true); hasAuth = false; } catch {}
    }
    // Append immutable recovery snapshots; never write captured anonymous state over an account.
    if (hasAuth) await saveSession({ ...before, automatic: true });
    const journal: Journal = { before, adapter, tabId, key: stateKey(c) };
    await chrome.storage.local.set({ switchJournal: journal });
    try {
      await apply(c, target, adapter);
      await reloadAndWait(tabId);
      const verification = adapter ? await verifyAuth(tabId, c.url.origin, adapter, !target) : "Unverified: legacy cookie-only switching.";
      const status: AnonymousStatus = { adapter, mode: target ? "account" : "anonymous", verification,
        ...(hasAuth ? { recoveryId: before.id } : {}) };
      if (target) await updateSession(target.id, { lastUsedAt: new Date().toISOString() });
      await chrome.storage.local.set({ [journal.key]: status });
      await chrome.storage.local.remove("switchJournal");
      return status;
    } catch {
      try { await rollback(c, journal); }
      catch { throw new Error("Switch failed and recovery is incomplete. Recovery snapshot retained; return to the original website/store and use Recover."); }
      throw new Error("Switch or authentication verification failed (possibly expired/revoked session). Previous local state restored; recovery snapshot retained.");
    }
  });
}
export const activateAnonymous = (tabId: number) => switchTo(tabId);
export const restoreSession = (sessionId: string, tabId: number) => switchTo(tabId, sessionId);
