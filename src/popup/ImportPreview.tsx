import { useLayoutEffect, useState } from "react";
import type { Session } from "../types/session";
import { importSessions } from "../messaging/client";
import { Dialog } from "./Dialog";

interface Props {
  open: boolean;
  sessions: Session[];
  onClose: () => void;
  onImported: () => void;
}

export function ImportPreview({ open, sessions, onClose, onImported }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    setResult(null);
    setError(null);
  }, [sessions]);

  // Group by domain for display
  const byDomain: Record<string, Session[]> = {};
  for (const s of sessions) {
    (byDomain[s.domain] ??= []).push(s);
  }

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await importSessions(sessions);
      if (resp.success && resp.data) {
        setResult(resp.data);
        onImported();
      } else {
        setError(resp.error ?? "Import failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} title={result ? "Import complete" : "Import sessions"} busy={busy} onClose={onClose}>
        {result ? (
          <>
            <p className="success-text" role="status">
              {result.imported} session{result.imported !== 1 ? "s" : ""} imported
              {result.skipped > 0 && (
                <>, {result.skipped} skipped (duplicate ID)</>
              )}
            </p>
            <div className="dialog-actions">
              <button className="btn btn-primary" onClick={onClose} autoFocus>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="dialog-description">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""} found
              in file:
            </p>

            <div className="import-preview-list">
              {Object.entries(byDomain)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([domain, domainSessions]) => (
                  <div key={domain} className="import-preview-group">
                    <div className="import-preview-domain">{domain}</div>
                    {domainSessions.map((s) => (
                      <div key={s.id} className="import-preview-item">
                        <span className="import-preview-label">{s.label}</span>
                        <span className="cookie-count">
                          {s.cookieCount} cookies
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>

            <div className="dialog-note">
              Imported sessions may be expired. A successful import does not
              guarantee the website will accept the session.
            </div>

            {error && <div className="error-text" role="alert">{error}</div>}

            <div className="dialog-actions">
              <button
                className="btn btn-secondary"
                onClick={onClose}
                disabled={busy}
                autoFocus
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={busy}
                aria-busy={busy}
              >
                Import sessions
              </button>
            </div>
          </>
        )}
    </Dialog>
  );
}
