import type { SavedCookie } from "./cookie";

export interface Session {
  id: string;
  label: string;
  domain: string;
  url: string;
  cookies: SavedCookie[];
  savedAt: string;
  lastUsedAt: string | null;
  cookieCount: number;
  storeId?: string;
  automatic?: boolean;
  authStorage?: AuthStorage;
}

export interface AuthStorage {
  origin: string;
  local: Record<string, string | null>;
  session: Record<string, string | null>;
}
