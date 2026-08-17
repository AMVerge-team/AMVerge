import { useState, type ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa";

type SettingsSectionProps = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export default function SettingsSection({
  title,
  description,
  defaultOpen = false,
  children,
}: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`settings-collapsible${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="settings-collapsible-header"
        onClick={() => setOpen((value) => !value)}
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
