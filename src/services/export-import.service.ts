import type { Session } from "../types/session";

// ── Schema ──

const EXPORT_FORMAT = "session-switcher-export" as const;
const SCHEMA_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  sessions: Session[];
}

// ── Validation ──

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: ExportFile;
}

const VALID_SAME_SITE: Record<string, true> = {
  unspecified: true,
  no_restriction: true,
  lax: true,
  strict: true,
};

function validateCookie(c: unknown, idx: number, sIdx: number): string[] {
  const errors: string[] = [];
  const prefix = `sessions[${sIdx}].cookies[${idx}]`;

  if (typeof c !== "object" || c === null) {
    return [`${prefix}: not an object`];
  }
  const cookie = c as Record<string, unknown>;

  if (typeof cookie.name !== "string" || cookie.name.length === 0)
    errors.push(`${prefix}.name: must be a non-empty string`);
  if (typeof cookie.value !== "string")
    errors.push(`${prefix}.value: must be a string`);
  if (typeof cookie.domain !== "string" || cookie.domain.length === 0)
    errors.push(`${prefix}.domain: must be a non-empty string`);
  if (typeof cookie.path !== "string")
    errors.push(`${prefix}.path: must be a string`);
  if (typeof cookie.secure !== "boolean")
    errors.push(`${prefix}.secure: must be a boolean`);
  if (typeof cookie.httpOnly !== "boolean")
    errors.push(`${prefix}.httpOnly: must be a boolean`);
  if (
    typeof cookie.sameSite !== "string" ||
    !Object.hasOwn(VALID_SAME_SITE, cookie.sameSite)
  )
    errors.push(
      `${prefix}.sameSite: must be one of ${Object.keys(VALID_SAME_SITE).join(", ")}`,
    );
  if (
    cookie.expirationDate !== undefined &&
    typeof cookie.expirationDate !== "number"
  )
    errors.push(`${prefix}.expirationDate: must be a number if present`);

  if (cookie.hostOnly !== undefined && typeof cookie.hostOnly !== "boolean") errors.push(`${prefix}.hostOnly: invalid`);
  if (cookie.storeId !== undefined && typeof cookie.storeId !== "string") errors.push(`${prefix}.storeId: invalid`);
  if (cookie.partitionKey !== undefined) {
    const pk = cookie.partitionKey as Record<string, unknown>;
    if (!pk || typeof pk.topLevelSite !== "string" ||
      (pk.hasCrossSiteAncestor !== undefined && typeof pk.hasCrossSiteAncestor !== "boolean")) errors.push(`${prefix}.partitionKey: invalid`);
  }
  return errors;
}

function validateSession(s: unknown, idx: number): string[] {
  const errors: string[] = [];
  const prefix = `sessions[${idx}]`;

  if (typeof s !== "object" || s === null) {
    return [`${prefix}: not an object`];
  }
  const session = s as Record<string, unknown>;

  if (typeof session.id !== "string" || session.id.length === 0)
    errors.push(`${prefix}.id: must be a non-empty string`);
  if (typeof session.label !== "string" || session.label.length === 0)
    errors.push(`${prefix}.label: must be a non-empty string`);
  if (typeof session.domain !== "string" || session.domain.length === 0)
    errors.push(`${prefix}.domain: must be a non-empty string`);
  if (typeof session.url !== "string")
    errors.push(`${prefix}.url: must be a string`);
  if (typeof session.savedAt !== "string")
    errors.push(`${prefix}.savedAt: must be a string`);
  if (session.lastUsedAt !== null && typeof session.lastUsedAt !== "string")
    errors.push(`${prefix}.lastUsedAt: must be a string or null`);
  if (typeof session.cookieCount !== "number")
    errors.push(`${prefix}.cookieCount: must be a number`);

  if (session.storeId !== undefined && typeof session.storeId !== "string") errors.push(`${prefix}.storeId: invalid`);
  if (session.automatic !== undefined && typeof session.automatic !== "boolean") errors.push(`${prefix}.automatic: invalid`);
  if (session.authStorage !== undefined) {
    const a = session.authStorage as Record<string, unknown>;
    if (!a || typeof a.origin !== "string" || ![a.local, a.session].every(v =>
      v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(x => x === null || typeof x === "string")))
      errors.push(`${prefix}.authStorage: invalid`);
  }
  if (!Array.isArray(session.cookies)) {
    errors.push(`${prefix}.cookies: must be an array`);
  } else {
    for (let i = 0; i < session.cookies.length; i++) {
      errors.push(...validateCookie(session.cookies[i], i, idx));
    }
  }

  return errors;
}

export function validateExportFile(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof raw !== "object" || raw === null) {
    return { valid: false, errors: ["File content is not a JSON object"] };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.format !== EXPORT_FORMAT) {
    errors.push(
      `Invalid format: expected "${EXPORT_FORMAT}", got "${String(obj.format)}"`,
    );
  }
  if (obj.version !== SCHEMA_VERSION) {
    errors.push(
      `Unsupported schema version: expected ${SCHEMA_VERSION}, got ${String(obj.version)}`,
    );
  }
  if (typeof obj.exportedAt !== "string") {
    errors.push("exportedAt: must be an ISO timestamp string");
  }

  if (!Array.isArray(obj.sessions)) {
    errors.push("sessions: must be an array");
    return { valid: false, errors };
  }

  if (obj.sessions.length === 0) {
    errors.push("sessions: file contains no sessions");
    return { valid: false, errors };
  }

  for (let i = 0; i < obj.sessions.length; i++) {
    errors.push(...validateSession(obj.sessions[i], i));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], data: obj as unknown as ExportFile };
}

// ── Export ──

export function buildExportFile(sessions: Session[]): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
  };
}

export function downloadJson(data: ExportFile, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function makeExportFilename(sessions: Session[]): string {
  const date = new Date().toISOString().slice(0, 10);
  // Use the first domain if single-domain, otherwise generic
  const domains = new Set(sessions.map((s) => s.domain));
  const prefix = domains.size === 1 ? [...domains][0] : "sessions";
  return `${prefix}-${date}.json`;
}

// ── Import (file parsing) ──

export function parseJsonFile(file: File): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  const reader = new FileReader();
  reader.onload = () => {
    try {
      resolve(JSON.parse(reader.result as string));
    } catch {
      reject(new Error("File is not valid JSON"));
    }
  };
  reader.onerror = () => reject(new Error("Failed to read file"));
  reader.readAsText(file);
  return promise;
}
