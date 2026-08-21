import type { ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa";
import { useSettingsSectionsStore } from "../../stores/settingsSectionsStore";

type SettingsSectionProps = {
  id: string;
  title: string;
  children: ReactNode;
};

export default function SettingsSection({
  id,
  title,
  children,
}: SettingsSectionProps) {
  // Open unless the user has collapsed this one before - the store only records
  // sections they actually toggled, so an absent entry means "never touched".
  const open = useSettingsSectionsStore((state) => state.openSections[id] ?? true);
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
        <FaChevronDown className="settings-collapsible-chevron" aria-hidden="true" />
      </button>
      {open ? <div className="settings-collapsible-body">{children}</div> : null}
    </div>
  );
}
