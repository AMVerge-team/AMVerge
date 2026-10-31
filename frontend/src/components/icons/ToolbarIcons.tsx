import { FaCog } from "react-icons/fa";
import { LuFileSearch } from "react-icons/lu";

/** flow's "input a file to find matches": a file with a magnifier, kept apart from the import icon */
export function FindMatchesIcon() {
  return <LuFileSearch aria-hidden="true" />;
}

/** a folder with a plus ("add a video from your files"), centered in its button */
export function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.5a2 2 0 0 1 2-2h4.2l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      {/* shorter and thinner than the outline, so it keeps clear of the folder's edges */}
      <path d="M12 11.25v4.5" strokeWidth="1.6" />
      <path d="M9.75 13.5h4.5" strokeWidth="1.6" />
    </svg>
  );
}

/** a three-disk database with a down arrow beside it ("import a database file") */
export function DatabaseImportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.6em" height="1.6em" fill="currentColor" aria-hidden="true">
      <ellipse cx="8" cy="4.5" rx="6" ry="2.5" />
      <path d="M2 5.9v4.6c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5.9c-1.2 1.5-3.5 2.5-6 2.5S3.2 7.4 2 5.9z" />
      <path d="M2 11.9v4.6c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.6c-1.2 1.5-3.5 2.5-6 2.5s-4.8-1-6-2.5z" />
      <rect x="18" y="6.5" width="2.6" height="9" rx="1.3" />
      <path d="M15 14.2h8.6l-4.3 6.3z" />
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
