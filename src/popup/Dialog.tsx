import { useId, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, busy = false, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
    >
      <div className="dialog-content">
        <h2 className="dialog-title" id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
