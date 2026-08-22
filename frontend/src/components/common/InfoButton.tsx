import { useEffect, useState, type ReactNode } from "react";
import { FaInfo, FaTimes } from "react-icons/fa";

type InfoButtonProps = {
  title: string;
  children: ReactNode;
};

/** Small "i" beside a setting label that opens a short explainer. */
export default function InfoButton({ title, children }: InfoButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="info-button"
        onClick={() => setOpen(true)}
        aria-label={`About ${title}`}
        title={`About ${title}`}
      >
        <FaInfo aria-hidden="true" />
      </button>

      {open && (
        <div
          className="info-modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="info-modal" role="dialog" aria-modal="true" aria-label={title}>
            <div className="info-modal-head">
              <h3 className="info-modal-title">{title}</h3>
              <button
                type="button"
                className="info-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
                title="Close"
              >
                <FaTimes aria-hidden="true" />
              </button>
            </div>
            <div className="info-modal-body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
