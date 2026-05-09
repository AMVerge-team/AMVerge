import type { ReactNode } from "react";

type SettingRowProps = {
  label: string;
  description: ReactNode;
  control: ReactNode;
};

export default function SettingRow({ label, description, control }: SettingRowProps) {
  return (
    <div className="export-setting-block">
      <div className="settings-row export-setting-row">
        <label className="settings-label">{label}</label>
        <div className="settings-control export-setting-control">{control}</div>
      </div>
      <p className="setting-description">{description}</p>
    </div>
  );
}