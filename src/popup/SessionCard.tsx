import { useState } from "react";
import type { Session } from "../types/session";
import {
  restoreSession,
  deleteSession,
  updateLabel,
  recaptureSession,
} from "../messaging/client";
import {
  buildExportFile,
  downloadJson,
  makeExportFilename,
} from "../services/export-import.service";

interface Props {
  session: Session;
  tabId: number;
  onUpdate: () => void;
  onRequestConfirm: (message: string, action: () => void) => void;
}

export function SessionCard({
  session,
  tabId,
  onUpdate,
  onRequestConfirm,
}: Props) {
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [newLabel, setNewLabel] = useState(session.label);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleSwitch() {
    setBusy("switch");
    try {
      setError("");
      const response = await restoreSession(session.id, tabId);
      if (!response.success) throw new Error(response.error ?? "Switch failed");
      onUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
      onUpdate();
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    onRequestConfirm(
      `Delete session "${session.label}"?`,
      async () => {
        setBusy("delete");
        try {
          const response = await deleteSession(session.id);
          if (!response.success) throw new Error(response.error ?? "Delete failed");
          onUpdate();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Operation failed");
        } finally {
          setBusy(null);
        }
      },
    );
  }

  async function handleRecapture() {
    setBusy("recapture");
    try {
      setError("");
      const response = await recaptureSession(session.id, tabId);
      if (!response.success) throw new Error(response.error ?? "Update failed");
      onUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleRename() {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === session.label) {
      setRenaming(false);
      setNewLabel(session.label);
      return;
    }
    setBusy("rename");
    try {
      const response = await updateLabel(session.id, trimmed);
      if (!response.success) throw new Error(response.error ?? "Rename failed");
      setRenaming(false);
      onUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(null);
    }
  }

  function handleExport() {
    const data = buildExportFile([session]);
    downloadJson(data, makeExportFilename([session]));
  }

  const savedDate = new Date(session.savedAt).toLocaleString();
  const lastUsed = session.lastUsedAt
    ? new Date(session.lastUsedAt).toLocaleString()
    : "Never";

  return (
    <div className="session-card">
      <div className="session-header">
        {renaming ? (
          <input
            className="rename-input"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") {
                setRenaming(false);
                setNewLabel(session.label);
              }
            }}
            onBlur={handleRename}
            autoFocus
          />
        ) : (
          <span className="session-label">{session.label}</span>
        )}
        <span className="cookie-count">{session.cookieCount} cookies</span>
      </div>

      {error && <div className="error-text" role="alert">{error}</div>}
      <div className="session-meta">
        <span>Saved: {savedDate}</span>
        <span>Last used: {lastUsed}</span>
      </div>

      <div className="session-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSwitch}
          disabled={busy !== null}
        >
          {busy === "switch" ? "Switching…" : "Switch"}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRecapture}
          disabled={busy !== null}
        >
          {busy === "recapture" ? "Updating…" : "Update"}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setRenaming(true);
            setNewLabel(session.label);
          }}
          disabled={busy !== null}
        >
          Rename
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleExport}
          disabled={busy !== null}
        >
          Export
        </button>
        <button
          className="btn btn-danger btn-sm"
          onClick={handleDelete}
          disabled={busy !== null}
        >
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
