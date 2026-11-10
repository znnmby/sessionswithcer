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
}

export interface NewSessionStatus {
  sessionId: string;
  savedLabel: string;
  origin: string;
  storeId: string;
  ready: boolean;
}
