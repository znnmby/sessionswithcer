import { useState } from "react";
import { useSessions } from "./hooks/useSessions";
import { useCurrentTab } from "./hooks/useCurrentTab";
import { SaveButton } from "./SaveButton";
import { SessionList } from "./SessionList";
import { ImportExportBar } from "./ImportExportBar";
import { ImportPreview } from "./ImportPreview";
import { ConfirmDialog, useConfirm } from "./ConfirmDialog";
import type { Session } from "../types/session";

export function App() {
  const { tab, domain, loading: tabLoading } = useCurrentTab();
  const { sessions, grouped, loading, error, refresh } = useSessions();
  const { isOpen, message, requestConfirm, confirm, cancel } = useConfirm();
  const [importPreview, setImportPreview] = useState<Session[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const tabId = tab?.id ?? -1;
  const isValidTab = tabId !== -1 && domain.length > 0;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true"><span /><span /></div>
        <div>
          <h1 className="app-title">Session Switcher</h1>
          <p className="app-subtitle">Your accounts, one workspace.</p>
        </div>
        <span className="local-badge">Local only</span>
      </header>

      {tabLoading ? (
        <div className="loading" role="status">
          <span className="spinner" aria-hidden="true" /> Finding your website…
        </div>
      ) : !isValidTab ? (
        <main className="empty-state">
          <div className="empty-mark" aria-hidden="true">SS</div>
          <h2>Start with a website</h2>
          <p>Open an HTTP or HTTPS page to save and switch accounts.</p>
        </main>
      ) : (
        <>
          <SaveButton revision={sessions} tabId={tabId} domain={domain} onSaved={refresh} />

          <section className="sessions-region" aria-label="Saved sessions" aria-busy={loading}>
            <div className="sessions-toolbar">
              <div>
                <h2 className="section-title">Your sessions</h2>
                <p className="section-meta" role="status">
                  {loading ? "Updating sessions…" : `${sessions.length} saved ${sessions.length === 1 ? "session" : "sessions"}`}
                </p>
              </div>
              <ImportExportBar
                sessions={sessions}
                onImportReady={(incoming) => {
                  setImportPreview(incoming);
                  setImportOpen(true);
                }}
              />
            </div>
            {error && <div className="error-text" role="alert">{error}</div>}
            {loading && sessions.length === 0 ? (
              <div className="loading" role="status">
                <span className="spinner" aria-hidden="true" /> Loading your sessions…
              </div>
            ) : (
              <SessionList
                grouped={grouped}
                tabId={tabId}
                onUpdate={refresh}
                onRequestConfirm={requestConfirm}
              />
            )}
          </section>
        </>
      )}

      <footer className="app-footer">Stored on this device. Cookie sessions are not encrypted.</footer>

      <ConfirmDialog
        open={isOpen}
        message={message}
        onConfirm={confirm}
        onCancel={cancel}
      />
      <ImportPreview
        open={importOpen}
        sessions={importPreview}
        onClose={() => setImportOpen(false)}
        onImported={refresh}
      />
    </div>
  );
}
