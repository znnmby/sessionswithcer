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

  useEffect(() => {
    getNewSessionStatus(tabId).then(response => {
      if (response.success) setPending(response.data ?? null);
    }).catch(() => setError("Cannot read New Session status."));
  }, [tabId, revision]);

  async function handleSave() {
    if (busy || !label.trim()) return;
    setBusy("save"); setError(null);
    try {
      const response = await captureCurrentSession(label.trim(), tabId);
      if (!response.success) throw new Error(response.error ?? "Failed to save");
      setLabel(""); setPending(null); onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(null); }
  }

  async function handleNew() {
    if (busy || pending) return;
    setBusy("new"); setError(null);
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
    <div className="save-section">
      <div className="save-domain">CURRENT : <strong>{domain.toUpperCase()}</strong></div>
      <div className="save-row">
        <input type="text" className="save-input"
          aria-label={pending ? "New account label" : "Session label"}
          placeholder={pending ? "Login akun baru, lalu isi label" : 'Label (e.g "Work Account")'}
          value={label} onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); }} disabled={busy !== null} />
        <button className="btn btn-save" onClick={handleSave} disabled={busy !== null || !label.trim()}>
          {busy === "save" ? "SAVING…" : "SAVE"}
        </button>
        <button className="btn btn-save" onClick={handleNew} disabled={busy !== null || pending !== null}
          title="Simpan sesi aktif, kosongkan cookie situs tanpa logout, lalu login akun baru. Label boleh kosong untuk memakai nama otomatis.">
          {busy === "new" ? "STARTING…" : "NEW"}
        </button>
      </div>
      {pending && <p className="new-session-status" role="status">
        Sesi “{pending.savedLabel}” tersimpan. {pending.ready
          ? "Cookie situs sudah dikosongkan. Login akun baru, lalu isi label dan Save."
          : "Proses New belum selesai. Pilih Switch pada sesi tersimpan untuk kembali."}
      </p>}
      <p className="new-session-hint">New memakai cookie swapping: cookie situs, termasuk preferensi, ikut dikosongkan dan tersimpan pada sesi sebelumnya. Tab situs yang sama berbagi sesi. Login berbasis storage atau SSO mungkin tetap aktif.</p>
      {error && <div className="error-text" role="alert">{error}</div>}
    </div>
  );
}
