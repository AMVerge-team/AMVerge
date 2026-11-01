import { FaCog } from './animated';
import { DatabaseDownloadIcon, FolderAddIcon } from './chrome/ChromeIcons';
import { LuFileSearch } from './animated';

/** flow's "input a file to find matches": a file with a magnifier, kept apart from the import icon */
export function FindMatchesIcon() {
  return <LuFileSearch aria-hidden="true" />;
}

/** a folder with a plus ("add a video from your files"), centered in its button */
export function ImportIcon() {
  return <FolderAddIcon />;
}

/** a three-disk database with a down arrow beside it ("import a database file") */
export function DatabaseImportIcon() {
  return <DatabaseDownloadIcon />;
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
