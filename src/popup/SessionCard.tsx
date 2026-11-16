import { useRef, useState } from "react";
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
  const renameButton = useRef<HTMLButtonElement>(null);

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
    if (busy) return;
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === session.label) {
      setRenaming(false);
      setNewLabel(session.label);
      return;
    }
    setBusy("rename");
    try {
      setError("");
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

  const savedDate = new Date(session.savedAt);
  const lastUsed = session.lastUsedAt ? new Date(session.lastUsedAt) : null;

  return (
    <article className="session-card" aria-label={session.label} aria-busy={busy !== null}>
      <div className="session-header">
        {renaming ? (
          <form className="rename-form" onSubmit={(event) => {
            event.preventDefault();
            void handleRename();
          }}>
            <input
              className="rename-input"
              aria-label="Session name"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
                if (event.key === "Escape" && !busy) {
                  event.preventDefault();
                  setRenaming(false);
                  setNewLabel(session.label);
                  renameButton.current?.focus();
                }
              }}
              disabled={busy !== null}
              autoFocus
            />
            <button className="btn btn-primary btn-sm" type="submit"
              disabled={busy !== null || !newLabel.trim()} aria-busy={busy === "rename"}>Save</button>
            <button className="btn btn-ghost btn-sm" type="button"
              disabled={busy !== null} onClick={() => {
                setRenaming(false);
                setNewLabel(session.label);
                renameButton.current?.focus();
              }}>Cancel</button>
          </form>
        ) : (
          <>
            <span className="session-avatar" aria-hidden="true">{session.label.trim().slice(0, 2).toUpperCase()}</span>
            <h3 className="session-label" title={session.label}>{session.label}</h3>
            <span className="cookie-count">{session.cookieCount} cookies</span>
          </>
        )}
      </div>

      {error && <div className="error-text" role="alert">{error}</div>}
      <div className="session-meta">
        <span>Saved <time dateTime={session.savedAt} title={savedDate.toLocaleString()}>{savedDate.toLocaleDateString()}</time></span>
        <span>Last used {lastUsed
          ? <time dateTime={session.lastUsedAt!} title={lastUsed.toLocaleString()}>{lastUsed.toLocaleDateString()}</time>
          : "Never"}</span>
      </div>

      <div className="session-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSwitch}
          disabled={busy !== null}
          aria-busy={busy === "switch"}
        >
          Switch
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRecapture}
          disabled={busy !== null}
          aria-busy={busy === "recapture"}
        >
          Update
        </button>
        <button
          className="btn btn-secondary btn-sm"
          ref={renameButton}
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
          className="btn btn-danger-ghost btn-sm"
          onClick={handleDelete}
          disabled={busy !== null}
          aria-busy={busy === "delete"}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
