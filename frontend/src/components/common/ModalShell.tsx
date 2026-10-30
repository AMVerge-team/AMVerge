import { useEffect, useState, type ReactNode } from "react";
import { FaTimes } from "react-icons/fa";

import Tooltip from "./Tooltip";
import { useEscapeToClose } from "./useEscapeToClose";

type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
};

/** full-screen overlay for the settings and menu modals; contents mount a frame later so the overlay paints at once */
export default function ModalShell({
  open,
  onClose,
  label,
  className,
  children,
}: ModalShellProps) {
  const [contentReady, setContentReady] = useState(false);
  useEscapeToClose(onClose, open);

  useEffect(() => {
    if (!open) {
      setContentReady(false);
      return;
    }
    const frame = requestAnimationFrame(() => setContentReady(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="app-modal-overlay"
      // target check, not stopPropagation, which would also stop the native event outside-click handlers need
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`app-modal${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <Tooltip content="Close">
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            aria-label={`Close ${label.toLowerCase()}`}
          >
            <FaTimes aria-hidden="true" />
          </button>
        </Tooltip>
        {contentReady ? children : null}
      </div>
    </div>
  );
}
