import { useState } from "react";
import { Dialog } from "./Dialog";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  message: string;
}

export function ConfirmDialog({ open, onConfirm, onCancel, message }: Props) {
  return (
    <Dialog open={open} title="Delete this session?" onClose={onCancel}>
      <p className="dialog-description">{message}</p>
      <p className="dialog-note">This removes the saved copy, not your current website login.</p>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={onConfirm}>
          Delete session
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Hook to manage confirm dialog state.
 */
export function useConfirm() {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [message, setMessage] = useState("");

  function requestConfirm(msg: string, action: () => void) {
    setMessage(msg);
    setPending(() => action);
  }

  function confirm() {
    pending?.();
    setPending(null);
  }

  function cancel() {
    setPending(null);
  }

  return {
    isOpen: pending !== null,
    message,
    requestConfirm,
    confirm,
    cancel,
  };
}
