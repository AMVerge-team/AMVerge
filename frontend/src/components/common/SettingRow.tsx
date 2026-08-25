import type { ReactNode } from "react";

type SettingRowProps = {
  label: string;
  description: ReactNode;
  control: ReactNode;
  /** Optional explainer rendered beside the label (see InfoButton). */
  info?: ReactNode;
};

export default function SettingRow({ label, description, control, info }: SettingRowProps) {
  return (
    <div className="export-setting-block">
      <div className="settings-row export-setting-row">
        <div className="setting-text">
          {/* No hover tooltip on either line: it only ever repeated the text
              underneath the cursor. */}
          <div className="settings-label-row">
            <label className="settings-label">{label}</label>
            {info}
          </div>
          {description ? <p className="setting-description">{description}</p> : null}
        </div>
        <div className="settings-control export-setting-control">{control}</div>
      </div>
    </div>
  );
}
