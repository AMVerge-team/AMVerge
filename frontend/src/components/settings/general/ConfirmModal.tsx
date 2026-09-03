import type { ReactNode } from "react";

type Props = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /** while true the modal cannot be dismissed and both buttons are disabled */
  busy?: boolean;
  /** a middle button, for a choice that is neither cancel nor the primary action */
  secondary?: { label: string; onClick: () => void };
};

// shared shape for the destructive confirmations in General settings
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  busy = false,
  secondary,
}: Props) {
  return (
    <div
      className="episode-modal-overlay"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <div className="episode-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">{title}</div>
        <div className="episode-modal-message">{message}</div>
        <div className="episode-modal-actions">
          <button type="button" className="episode-modal-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {secondary && (
            <button type="button" className="episode-modal-btn" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          )}
          <button
            type="button"
            className="episode-modal-btn primary"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
