import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEscapeToClose } from "../../common/useEscapeToClose";

type Props = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  secondary?: { label: string; onClick: () => void };
  /** null drops the cancel button, for a notice with only an OK */
  cancelLabel?: string | null;
  confirmDisabled?: boolean;
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
  cancelLabel,
  confirmDisabled = false,
}: Props) {
  const { t } = useTranslation("settings");
  // undefined falls back to the shared cancel label; null hides the button
  const resolvedCancelLabel = cancelLabel === undefined ? t("common:cancel") : cancelLabel;
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeToClose(onClose, !busy);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div
      className="episode-modal-overlay"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="episode-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="episode-modal-title">{title}</div>
        <div className="episode-modal-message">{message}</div>
        <div className="episode-modal-actions">
          {resolvedCancelLabel !== null && (
            <button type="button" className="episode-modal-btn" onClick={onClose} disabled={busy}>
              {resolvedCancelLabel}
            </button>
          )}
          {secondary && (
            <button type="button" className="episode-modal-btn" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          )}
          <button
            type="button"
            className="episode-modal-btn primary"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
