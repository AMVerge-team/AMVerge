import type { ReactNode } from "react";

type SettingRowProps = {
  label: string;
  description: ReactNode;
  control: ReactNode;
};

export default function SettingRow({ label, description, control }: SettingRowProps) {
  const descriptionTitle = typeof description === "string" ? description : undefined;

  return (
    <div className="export-setting-block">
      <div className="settings-row export-setting-row">
        <div className="setting-text">
          <label className="settings-label" title={label}>{label}</label>
          {description ? (
            <p className="setting-description" title={descriptionTitle}>{description}</p>
          ) : null}
        </div>
        <div className="settings-control export-setting-control">{control}</div>
      </div>
    </div>
  );
}