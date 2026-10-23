import { FaCog } from "react-icons/fa";
import { LuFileSearch } from "react-icons/lu";

/** flow's "input a file to find matches": a file with a magnifier, kept apart from the import icon */
export function FindMatchesIcon() {
  return <LuFileSearch aria-hidden="true" />;
}

/**
 * a folder with a plus: "add a video from your files". the old arrow into a tray read as
 * download. a folder rather than a page, so it never looks like flow's page-and-magnifier.
 * spans x 3..21 around the centre, so it sits dead centre in its button
 */
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

/** one gear with a smaller, dimmer gear tucked behind its bottom right */
export function SettingsIcon() {
  return (
    <span className="settings-icon" aria-hidden="true">
      <FaCog className="settings-icon-back" />
      <FaCog className="settings-icon-front" />
    </span>
  );
}
