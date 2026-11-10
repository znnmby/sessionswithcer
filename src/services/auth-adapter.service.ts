import type { AuthAdapter } from "../types/auth";
import type { SavedCookie } from "../types/cookie";
import type { AuthStorage } from "../types/session";

export function validateAdapter(raw: unknown, domain: string): AuthAdapter {
  const a = raw as AuthAdapter;
  if (!a || a.domain !== domain || !Array.isArray(a.cookies) ||
    !Array.isArray(a.localKeys) || !Array.isArray(a.sessionKeys) ||
    ![...a.localKeys, ...a.sessionKeys].every(k => typeof k === "string" && k.length > 0) ||
    !a.cookies.every(c => c && typeof c.name === "string" && c.name.length > 0 &&
      typeof c.domain === "string" && (c.domain.replace(/^\./, "") === domain ||
        domain.endsWith(`.${c.domain.replace(/^\./, "")}`)) &&
      (c.path === undefined || (typeof c.path === "string" && c.path.startsWith("/")))) ||
    (!a.cookies.length && !a.localKeys.length && !a.sessionKeys.length) ||
    (a.verification !== undefined && (!a.verification ||
      typeof a.verification.authenticated !== "string" || !a.verification.authenticated.trim() ||
      typeof a.verification.anonymous !== "string" || !a.verification.anonymous.trim()))) {
    throw new Error("Invalid adapter. Specify exact auth cookie names/domains and storage keys for this host.");
  }
  return a;
}
export async function getAdapter(domain: string): Promise<AuthAdapter | null> {
  const key = `adapter:${domain}`;
  const result = await chrome.storage.local.get(key);
  return result[key] ? validateAdapter(result[key], domain) : null;
}
export async function saveAdapter(domain: string, raw: unknown): Promise<void> {
  const adapter = validateAdapter(raw, domain);
  await chrome.storage.local.set({ [`adapter:${domain}`]: adapter });
}
export function isAuthCookie(c: SavedCookie, a: AuthAdapter): boolean {
  return a.cookies.some(r => r.name === c.name &&
    r.domain.replace(/^\./, "") === c.domain.replace(/^\./, "") &&
    (r.path === undefined || r.path === c.path));
}

// Isolated world, top frame only. Never enumerate or clear unrelated storage keys.
export async function authStorage(tabId: number, origin: string, adapter: AuthAdapter,
  write?: AuthStorage): Promise<AuthStorage> {
  const [result] = await chrome.scripting.executeScript({ target: { tabId },
    func: (expected: string, localKeys: string[], sessionKeys: string[], values: AuthStorage | null) => {
      if (location.origin !== expected) throw new Error("Website changed during switching.");
      const read = (storage: Storage, keys: string[], updates?: Record<string,string|null>) => {
        const out: Record<string,string|null> = {};
        for (const key of keys) {
          if (updates) {
            const value = updates[key] ?? null;
            if (value === null) storage.removeItem(key); else storage.setItem(key, value);
          }
          out[key] = storage.getItem(key);
          if (updates && out[key] !== (updates[key] ?? null)) throw new Error("Auth storage write failed.");
        }
        return out;
      };
      return { origin: expected, local: read(localStorage, localKeys, values?.local),
        session: read(sessionStorage, sessionKeys, values?.session) };
    }, args: [origin, adapter.localKeys, adapter.sessionKeys, write ?? null] });
  if (!result?.result) throw new Error("Cannot access authentication storage.");
  return result.result;
}
export async function verifyAuth(tabId: number, origin: string, adapter: AuthAdapter,
  anonymous: boolean): Promise<string> {
  if (!adapter.verification) return "Unverified: adapter has no authentication verifier.";
  const [result] = await chrome.scripting.executeScript({ target: { tabId },
    func: (expected: string, yes: string, no: string, anon: boolean) => {
      if (location.origin !== expected) return false;
      return !!document.querySelector(anon ? no : yes) && !document.querySelector(anon ? yes : no);
    }, args: [origin, adapter.verification.authenticated, adapter.verification.anonymous, anonymous] });
  if (result?.result !== true) throw new Error("Authentication verification failed: expired/revoked session, incomplete adapter, or page not ready.");
  return anonymous ? "Anonymous verified by website adapter." : "Account verified by website adapter.";
}
