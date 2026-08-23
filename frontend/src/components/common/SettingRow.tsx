import type { ReactNode } from "react";

import Tooltip from "./Tooltip";

type SettingRowProps = {
  label: string;
  description: ReactNode;
  control: ReactNode;
  /** Optional explainer rendered beside the label (see InfoButton). */
  info?: ReactNode;
};

export default function SettingRow({ label, description, control, info }: SettingRowProps) {
  const descriptionTitle = typeof description === "string" ? description : undefined;

  return (
    <div className="export-setting-block">
      <div className="settings-row export-setting-row">
        <div className="setting-text">
          {/* label and description are both clipped when the row is narrow, so
              each carries its own full text on hover */}
          <div className="settings-label-row">
            <Tooltip content={label}>
              <label className="settings-label">{label}</label>
            </Tooltip>
            {info}
          </div>
          {description ? (
            <Tooltip content={descriptionTitle} maxWidth={320}>
              <p className="setting-description">{description}</p>
            </Tooltip>
          ) : null}
        </div>
        <div className="settings-control export-setting-control">{control}</div>
      </div>
    </div>
  );
}