import type { SavedCookie } from "../types/cookie";
import { buildCookieUrl } from "../utils/domain";

export function cookieIdentity(c: SavedCookie): string {
  return JSON.stringify([c.name, c.domain, c.path, c.storeId,
    c.partitionKey?.topLevelSite, c.partitionKey?.hasCrossSiteAncestor ?? false]);
}

export async function getCookiesForDomain(domain: string, storeId?: string,
  partitionKey?: chrome.cookies.CookiePartitionKey): Promise<SavedCookie[]> {
  // Include parent-domain cookies and sibling paths, but never unrelated hosts.
  const queries = [chrome.cookies.getAll({ storeId })];
  if (partitionKey) queries.push(chrome.cookies.getAll({ storeId, partitionKey }));
  const all = (await Promise.all(queries)).flat();
  return [...new Map(all.filter(c => {
    const host = c.domain.replace(/^\./, "");
    return c.hostOnly ? host === domain : domain === host || domain.endsWith(`.${host}`);
  }).map(c => [cookieIdentity(c), c])).values()];
}

export async function removeCookies(cookies: SavedCookie[]): Promise<void> {
  // API deletion is URL based. Resolve collisions against the full pending set,
  // rather than assuming which domain wins for an identical name and path.
  const pending = [...cookies].sort((a,b) => b.path.length-a.path.length);
  while (pending.length) {
    const wanted = pending[0];
    const query = { url: buildCookieUrl(wanted), name: wanted.name, storeId: wanted.storeId,
      ...(wanted.partitionKey ? { partitionKey: wanted.partitionKey } : {}) };
    const selected = await chrome.cookies.get(query);
    if (!selected) { pending.shift(); continue; }
    const idx = pending.findIndex(c => cookieIdentity(c) === cookieIdentity(selected));
    if (idx < 0) throw new Error("Cookie removal is ambiguous; no further cookies were removed.");
    if (!await chrome.cookies.remove(query)) throw new Error("Cookie removal failed.");
    const remaining = await chrome.cookies.getAll({ storeId: selected.storeId,
      ...(selected.partitionKey ? { partitionKey: selected.partitionKey } : {}) });
    if (remaining.some(x => cookieIdentity(x) === cookieIdentity(selected))) throw new Error("Cookie removal could not be confirmed.");
    pending.splice(idx, 1);
  }
}

export async function clearCookiesForDomain(domain: string, storeId?: string): Promise<void> {
  await removeCookies(await getCookiesForDomain(domain, storeId));
}

export async function setCookies(cookies: SavedCookie[], storeId?: string): Promise<void> {
  for (const c of cookies) {
    if (c.expirationDate !== undefined && c.expirationDate <= Date.now()/1000)
      throw new Error("Saved authentication cookie has expired. Sign in again or choose a newer snapshot.");
    const hostOnly = c.hostOnly ?? !c.domain.startsWith(".");
    const result = await chrome.cookies.set({
      url: buildCookieUrl(c), name: c.name, value: c.value,
      ...(hostOnly ? {} : { domain: c.domain }), path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
      storeId: storeId ?? c.storeId,
      ...(c.expirationDate === undefined ? {} : { expirationDate: c.expirationDate }),
      ...(c.partitionKey ? { partitionKey: c.partitionKey } : {}),
    });
    if (!result || result.value !== c.value || result.path !== c.path ||
      result.hostOnly !== hostOnly || result.secure !== c.secure || result.httpOnly !== c.httpOnly ||
      result.sameSite !== c.sameSite || result.storeId !== (storeId ?? c.storeId ?? result.storeId) ||
      result.domain.replace(/^\./, "") !== c.domain.replace(/^\./, "") ||
      result.partitionKey?.topLevelSite !== c.partitionKey?.topLevelSite ||
      (result.partitionKey?.hasCrossSiteAncestor ?? false) !== (c.partitionKey?.hasCrossSiteAncestor ?? false) ||
      (c.expirationDate === undefined ? result.expirationDate !== undefined :
        result.expirationDate === undefined || Math.abs(result.expirationDate - c.expirationDate) > 1))
      throw new Error("Cookie restoration could not be confirmed.");
  }
}
