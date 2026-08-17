import type { ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa";
import { useSettingsSectionsStore } from "../../stores/settingsSectionsStore";

type SettingsSectionProps = {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export default function SettingsSection({
  id,
  title,
  description,
  children,
}: SettingsSectionProps) {
  const open = useSettingsSectionsStore((state) => Boolean(state.openSections[id]));
  const setSectionOpen = useSettingsSectionsStore((state) => state.setSectionOpen);

  return (
    <div className={`settings-collapsible${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="settings-collapsible-header"
        onClick={() => setSectionOpen(id, !open)}
        aria-expanded={open}
      >
        <span className="settings-collapsible-title">{title}</span>
        {description ? (
          <span className="settings-collapsible-desc">{description}</span>
        ) : null}
        <FaChevronDown className="settings-collapsible-chevron" aria-hidden="true" />
      </button>
      {open ? <div className="settings-collapsible-body">{children}</div> : null}
    </div>
  );
}
