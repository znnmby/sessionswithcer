export interface AuthAdapter {
  domain: string;
  cookies: { name: string; domain: string; path?: string }[];
  localKeys: string[];
  sessionKeys: string[];
  verification?: { authenticated: string; anonymous: string };
}
export interface AnonymousStatus {
  adapter: AuthAdapter | null;
  mode: "anonymous" | "account" | "unknown";
  verification: string;
  recoveryId?: string;
}
