import { useEffect, useState } from "react";
import { anonymousAction } from "../messaging/client";
import type { AnonymousStatus } from "../types/auth";

export function AnonymousSession({ tabId, domain, onUpdate, revision }: { tabId: number; domain: string; onUpdate: () => void; revision: unknown }) {
  const [status, setStatus] = useState<AnonymousStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [config, setConfig] = useState(JSON.stringify({ domain, cookies: [], localKeys: [], sessionKeys: [] }, null, 2));
  useEffect(() => { anonymousAction("ANONYMOUS_STATUS", tabId).then(setStatus).catch(e => setError(e.message)); }, [tabId, revision]);
  async function run(type: "ACTIVATE_ANONYMOUS" | "SAVE_ADAPTER" | "RECOVER_SWITCH") {
    setBusy(true); setError("");
    try {
      const result = await anonymousAction(type, tabId, type === "SAVE_ADAPTER" ? JSON.parse(config) : undefined);
      setStatus(result); setConfiguring(false); onUpdate();
    } catch (e) { setError(e instanceof Error ? e.message : "Operation failed."); onUpdate(); }
    finally { setBusy(false); }
  }
  return <section className="anonymous-section">
    <div className="session-card">
      <div className="session-header"><strong>Anonymous</strong><span className="cookie-count">Virtual profile</span></div>
      <p>{status?.mode === "anonymous" ? "Anonymous selected" : `Sessions — ${domain}`}</p>
      <p className="auth-status" role="status">{status?.verification ?? "Checking authentication support…"}</p>
      {!status?.adapter && <p className="auth-status">Unsupported until exact authentication cookies and storage keys are configured for this website.</p>}
      <div className="session-actions">
        <button className="btn btn-primary btn-sm" disabled={busy || !status?.adapter} onClick={() => run("ACTIVATE_ANONYMOUS")}>{busy ? "Working…" : "Use Anonymous"}</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => {
          if (status?.adapter) setConfig(JSON.stringify(status.adapter, null, 2));
          setConfiguring(!configuring);
        }}>Configure website</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run("RECOVER_SWITCH")}>Recover interrupted switch</button>
      </div>
      {configuring && <div>
        <p className="auth-status">Enter an adapter reviewed for this website. Only listed authentication data is cleared. See README for the schema and verification selectors.</p>
        <textarea className="adapter-input" aria-label="Website authentication adapter JSON" value={config} onChange={e => setConfig(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run("SAVE_ADAPTER")}>Save adapter</button>
      </div>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  </section>;
}
