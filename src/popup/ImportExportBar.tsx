import { useRef, useState } from "react";
import type { Session } from "../types/session";
import {
  buildExportFile,
  downloadJson,
  makeExportFilename,
  parseJsonFile,
  validateExportFile,
} from "../services/export-import.service";
import type { ValidationResult } from "../services/export-import.service";

interface Props {
  sessions: Session[];
  onImportReady: (sessions: Session[]) => void;
}

export function ImportExportBar({ sessions, onImportReady }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  function handleExportAll() {
    if (sessions.length === 0) return;
    const data = buildExportFile(sessions);
    downloadJson(data, makeExportFilename(sessions));
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError(null);

    try {
      const raw = await parseJsonFile(file);
      const result: ValidationResult = validateExportFile(raw);

      if (!result.valid || !result.data) {
        // Show first 3 errors max
        const preview = result.errors.slice(0, 3);
        if (result.errors.length > 3) {
          preview.push(`…and ${result.errors.length - 3} more errors`);
        }
        setImportError(preview.join("\n"));
        return;
      }

      onImportReady(result.data.sessions);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setImporting(false);
      // Reset input so re-selecting the same file works
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="import-export-bar">
      <button
        className="btn btn-ghost btn-sm"
        onClick={handleExportAll}
        disabled={sessions.length === 0}
        title="Export all sessions to JSON"
      >
        Export all
      </button>

      <button
        className="btn btn-secondary btn-sm"
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        aria-busy={importing}
      >
        Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileSelected}
        disabled={importing}
        hidden
        aria-label="Import sessions file"
      />

      {importError && (
        <div className="import-error error-text" role="alert">{importError}</div>
      )}
    </div>
  );
}
