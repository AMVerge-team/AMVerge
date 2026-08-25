import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import Tooltip from "./Tooltip";

type SettingRowProps = {
  label: string;
  description: ReactNode;
  control: ReactNode;
  /** Optional explainer rendered beside the label (see InfoButton). */
  info?: ReactNode;
};

const isClipped = (node: HTMLElement | null) =>
  !!node && (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight);

export default function SettingRow({ label, description, control, info }: SettingRowProps) {
  const descriptionTitle = typeof description === "string" ? description : undefined;

  // The label ellipsises on one line and the description clamps to two, so a
  // tooltip repeating them is only worth showing once the text is genuinely cut
  // off; otherwise it hands back what the eye already reads.
  //
  // Both are measured from this one host and found by class, because Tooltip
  // clones its child and owns that ref — and because wrapping either in a node
  // of our own would add a flex item to the row's text column.
  const textRef = useRef<HTMLDivElement | null>(null);
  const [clipped, setClipped] = useState({ label: false, description: false });

  const measure = useCallback(() => {
    const host = textRef.current;
    if (!host) return;
    const next = {
      label: isClipped(host.querySelector<HTMLElement>(".settings-label")),
      description: isClipped(host.querySelector<HTMLElement>(".setting-description")),
    };
    setClipped((prev) =>
      prev.label === next.label && prev.description === next.description ? prev : next
    );
  }, []);

  useEffect(() => {
    measure();
    const host = textRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    // Dragging the sidebar divider resizes the row without re-rendering it.
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [measure, label, descriptionTitle]);

  return (
    <div className="export-setting-block">
      <div className="settings-row export-setting-row">
        <div className="setting-text" ref={textRef}>
          <div className="settings-label-row">
            <Tooltip content={label} disabled={!clipped.label}>
              <label className="settings-label">{label}</label>
            </Tooltip>
            {info}
          </div>
          {description ? (
            <Tooltip
              content={descriptionTitle}
              maxWidth={320}
              disabled={!clipped.description}
            >
              <p className="setting-description">{description}</p>
            </Tooltip>
          ) : null}
        </div>
        <div className="settings-control export-setting-control">{control}</div>
      </div>
    </div>
  );
}
