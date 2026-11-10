export interface SavedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
  expirationDate?: number;
  storeId?: string;
  hostOnly?: boolean;
  partitionKey?: chrome.cookies.CookiePartitionKey;
}
