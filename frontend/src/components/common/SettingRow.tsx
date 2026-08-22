import type { ReactNode } from "react";

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
          <div className="settings-label-row">
            <label className="settings-label" title={label}>{label}</label>
            {info}
          </div>
          {description ? (
            <p className="setting-description" title={descriptionTitle}>{description}</p>
          ) : null}
        </div>
        <div className="settings-control export-setting-control">{control}</div>
      </div>
    </div>
  );
}