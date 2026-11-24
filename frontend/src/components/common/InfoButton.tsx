import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FaInfo, FaQuestionCircle, FaTimes } from '../icons/animated';

import Tooltip from "./Tooltip";
import { useEscapeToClose } from "./useEscapeToClose";

type InfoButtonProps = {
  title: string;
  children: ReactNode;
  /** "toolbar" sizes it like the toolbar buttons beside it (rounded square, accent border) */
  variant?: "inline" | "toolbar";
  icon?: "info" | "question";
  dataGettingStarted?: string;
  modalClassName?: string;
};

/** small "i" or "?" button that opens a short explainer modal */
export default function InfoButton({
  title,
  children,
  variant = "inline",
  icon = "info",
  dataGettingStarted,
  modalClassName,
}: InfoButtonProps) {
  const { t } = useTranslation("shell");
  const [open, setOpen] = useState(false);

  useEscapeToClose(() => setOpen(false), open);

  return (
    <>
      <Tooltip content={t("infoButton.about", { title })}>
        <button
          type="button"
          className={variant === "toolbar" ? "info-button toolbar-info-button" : "info-button"}
          onClick={() => setOpen(true)}
          aria-label={t("infoButton.about", { title })}
          data-getting-started={dataGettingStarted}
        >
          {icon === "question" ? <FaQuestionCircle aria-hidden="true" /> : <FaInfo aria-hidden="true" />}
        </button>
      </Tooltip>

      {/* portalled to <body>: inside a blurred or animated panel "fixed" pins to that panel and scrolls with it */}
      {open && createPortal(
        <div
          className="info-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className={modalClassName ? `info-modal ${modalClassName}` : "info-modal"} role="dialog" aria-modal="true" aria-label={title}>
            <div className="info-modal-head">
              <h3 className="info-modal-title">{title}</h3>
              <Tooltip content={t("common:close")}>
                <button
                  type="button"
                  className="info-modal-close"
                  onClick={() => setOpen(false)}
                  aria-label={t("common:close")}
                >
                  <FaTimes aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
            <div className="info-modal-body">{children}</div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
