import { FaCog } from "react-icons/fa";
import { LuFileSearch } from "react-icons/lu";

/** flow's "input a file to find matches": a file with a magnifier, kept apart from the import icon */
export function FindMatchesIcon() {
  return <LuFileSearch aria-hidden="true" />;
}

/** arrow down into a tray, symmetric about the centre so it sits dead centre in its button */
export function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v11" />
      <path d="M7.5 9.5 12 14l4.5-4.5" />
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

/** one gear with a smaller, dimmer gear tucked behind its bottom right */
export function SettingsIcon() {
  return (
    <span className="settings-icon" aria-hidden="true">
      <FaCog className="settings-icon-back" />
      <FaCog className="settings-icon-front" />
    </span>
  );
}
