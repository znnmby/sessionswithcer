import type {
  ExtensionMessage,
  ExtensionResponse,
} from "./messages";
import type { Session } from "../types/session";

async function sendMessage<T = unknown>(
  message: ExtensionMessage,
): Promise<ExtensionResponse<T>> {
  return chrome.runtime.sendMessage(message);
}

export async function captureCurrentSession(
  label: string,
  tabId: number,
): Promise<ExtensionResponse<Session>> {
  return sendMessage<Session>({
    type: "CAPTURE_SESSION",
    payload: { label, tabId },
  });
}

export async function restoreSession(
  sessionId: string,
  tabId: number,
): Promise<ExtensionResponse> {
  return sendMessage({
    type: "RESTORE_SESSION",
    payload: { sessionId, tabId },
  });
}

export async function deleteSession(
  sessionId: string,
): Promise<ExtensionResponse> {
  return sendMessage({
    type: "DELETE_SESSION",
    payload: { sessionId },
  });
}

export async function updateLabel(
  sessionId: string,
  newLabel: string,
): Promise<ExtensionResponse> {
  return sendMessage({
    type: "UPDATE_LABEL",
    payload: { sessionId, newLabel },
  });
}

export async function recaptureSession(
  sessionId: string,
  tabId: number,
): Promise<ExtensionResponse<Session>> {
  return sendMessage<Session>({
    type: "RECAPTURE_SESSION",
    payload: { sessionId, tabId },
  });
}

export async function getSessions(): Promise<ExtensionResponse<Session[]>> {
  return sendMessage<Session[]>({
    type: "GET_SESSIONS",
  });
}

export async function importSessions(
  sessions: Session[],
): Promise<ExtensionResponse<{ imported: number; skipped: number }>> {
  return sendMessage<{ imported: number; skipped: number }>({
    type: "IMPORT_SESSIONS",
    payload: { sessions },
  });
}

export async function anonymousAction(type: "ACTIVATE_ANONYMOUS" | "ANONYMOUS_STATUS" | "RECOVER_SWITCH" | "SAVE_ADAPTER", tabId: number, adapter?: unknown) {
  const response = await sendMessage<import("../types/auth").AnonymousStatus>({ type, payload: { tabId, adapter } });
  if (!response.success) throw new Error(response.error ?? "Session operation failed.");
  return response.data;
}
