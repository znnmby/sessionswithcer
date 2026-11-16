import { useEffect, useState } from "react";
import { captureCurrentSession, startNewSession, getNewSessionStatus } from "../messaging/client";
import type { NewSessionStatus } from "../types/session";

interface Props {
  tabId: number;
  domain: string;
  onSaved: () => void;
  revision: unknown;
}

export function SaveButton({ tabId, domain, onSaved, revision }: Props) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<"save" | "new" | null>(null);
  const [pending, setPending] = useState<NewSessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    getNewSessionStatus(tabId).then(response => {
      if (active && response.success) setPending(response.data ?? null);
    }).catch(() => {
      if (active) setError("Cannot read New Session status.");
    });
    return () => { active = false; };
  }, [tabId, revision]);

  async function handleSave() {
    if (busy || !label.trim()) return;
    setBusy("save"); setError(null); setNotice("");
    try {
      const response = await captureCurrentSession(label.trim(), tabId);
      if (!response.success) throw new Error(response.error ?? "Failed to save");
      setLabel(""); setPending(null); setNotice("Session saved."); onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(null); }
  }

  async function handleNew() {
    if (busy || pending) return;
    setBusy("new"); setError(null); setNotice("");
    try {
      const response = await startNewSession(label.trim(), tabId);
      if (!response.success || !response.data) throw new Error(response.error ?? "Failed to start new session");
      setPending(response.data); setLabel(""); onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // The existing account may already have been saved before a cookie operation failed.
      onSaved();
    } finally { setBusy(null); }
  }

  return (
    <section className="save-section" aria-label="Current website">
      <div className="save-domain">
        <span className="status-dot" aria-hidden="true" />
        <span className="eyebrow">Current website</span>
        <strong title={domain}>{domain}</strong>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
        <label className="input-label" htmlFor="session-label">
          {pending ? "New account label" : "Session label"}
        </label>
        <div className="save-row">
          <input
            id="session-label"
            type="text"
            className="save-input"
            placeholder="e.g. Work account"
            value={label}
            onChange={event => { setLabel(event.target.value); setNotice(""); }}
            onKeyDown={event => {
              if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
            }}
            disabled={busy !== null}
            autoComplete="off"
          />
          <button className="btn btn-primary" type="submit"
            disabled={busy !== null || !label.trim()} aria-busy={busy === "save"}>
            Save session
          </button>
          <button className="btn btn-secondary" type="button" onClick={handleNew}
            disabled={busy !== null || pending !== null} aria-busy={busy === "new"}
            title="Save the current cookies, clear them, then sign in to another account.">
            New
          </button>
        </div>
      </form>
      {pending && <p className="new-session-status" role="status">
        <strong>“{pending.savedLabel}” is saved.</strong>{" "}{pending.ready
          ? "Sign in to the new account, then label and save it here."
          : "New session is incomplete. Switch to the saved session to return."}
      </p>}
      <details className="session-help">
        <summary>How does New work?</summary>
        <p>New saves and clears this site's cookies, including preferences. Tabs on the same site share a session. Storage-based or SSO logins may stay active.</p>
      </details>
      {notice && <p className="success-text" role="status">{notice}</p>}
      {error && <div className="error-text" role="alert">{error}</div>}
    </section>
  );
}
