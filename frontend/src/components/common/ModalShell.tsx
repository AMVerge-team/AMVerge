import { useEffect, useState, type ReactNode } from "react";
import { FaTimes } from "react-icons/fa";

import Tooltip from "./Tooltip";

type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  children: ReactNode;
};

/**
 * full-screen overlay shared by the settings and menu modals. the frame paints
 * on the click; its contents mount a frame later, so a heavy panel never delays
 * the overlay appearing.
 */
export default function ModalShell({
  open,
  onClose,
  label,
  className,
  children,
}: ModalShellProps) {
  const [contentReady, setContentReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setContentReady(false);
      return;
    }
    const frame = requestAnimationFrame(() => setContentReady(true));
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="app-modal-overlay"
      // target check rather than stopPropagation on the panel: stopping the
      // synthetic event also stops the native one, which document-level
      // outside-click handlers (dropdowns) rely on
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
