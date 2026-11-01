// Dev-only gallery: every animated icon in a real button, at the size the app
// draws it. Run `npm run dev` and open /icon-gallery.html. Not part of a build.
import { createRoot } from 'react-dom/client';
import * as A from './components/icons/animated';
import * as C from './components/icons/chrome/ChromeIcons';

type Entry = { name: string; Icon: React.ComponentType<any>; clips: string[]; props?: object };

const pack: Entry[] = [
  { name: 'FaAngleRightIcon', Icon: A.FaAngleRightIcon, clips: ["hover: peek", "click: go"] },
  { name: 'FaAppleIcon', Icon: A.FaAppleIcon, clips: ["hover: tip", "click: press"] },
  { name: 'FaArrowDownIcon', Icon: A.FaArrowDownIcon, clips: ["hover: peek", "click: go"] },
  { name: 'FaArrowLeftIcon', Icon: A.FaArrowLeftIcon, clips: ["hover: peek", "click: go"] },
  { name: 'FaArrowUpIcon', Icon: A.FaArrowUpIcon, clips: ["hover: peek", "click: go"] },
  { name: 'FaArrowsAltHIcon', Icon: A.FaArrowsAltHIcon, clips: ["hover: pinch", "click: flip"] },
  { name: 'FaArrowsAltVIcon', Icon: A.FaArrowsAltVIcon, clips: ["hover: pinch", "click: flip"] },
  { name: 'FaBanIcon', Icon: A.FaBanIcon, clips: ["hover: no", "click: refuse"] },
  { name: 'FaBarsIcon', Icon: A.FaBarsIcon, clips: ["hover: part", "click: open"] },
  { name: 'FaBoldIcon', Icon: A.FaBoldIcon, clips: ["hover: weight", "on: heavy"] },
  { name: 'FaBoltIcon', Icon: A.FaBoltIcon, clips: ["hover: flicker", "click: throw"] },
  { name: 'FaBugIcon', Icon: A.FaBugIcon, clips: ["hover: notice", "click: spotted"] },
  { name: 'FaCalendarAltIcon', Icon: A.FaCalendarAltIcon, clips: ["hover: band", "click: raise-band"] },
  { name: 'FaCalendarPlusIcon', Icon: A.FaCalendarPlusIcon, clips: ["hover: band", "click: raise-band"] },
  { name: 'FaCheckIcon', Icon: A.FaCheckIcon, clips: ["hover: trace", "click: strike"] },
  { name: 'FaCheckCircleIcon', Icon: A.FaCheckCircleIcon, clips: ["hover: lift", "click: stamp"] },
  { name: 'FaChevronDownIcon', Icon: A.FaChevronDownIcon, clips: ["hover: tip", "on: open"] },
  { name: 'FaChevronLeftIcon', Icon: A.FaChevronLeftIcon, clips: ["hover: peek", "click: go"] },
  { name: 'FaChevronRightIcon', Icon: A.FaChevronRightIcon, clips: ["hover: peek", "click: go"] },
  { name: 'FaChevronUpIcon', Icon: A.FaChevronUpIcon, clips: ["hover: tip", "on: fold"] },
  { name: 'FaCodeBranchIcon', Icon: A.FaCodeBranchIcon, clips: ["hover: lean", "click: branch"] },
  { name: 'FaCogIcon', Icon: A.FaCogIcon, clips: ["click: turn", "hover: tooth"] },
  { name: 'FaColumnsIcon', Icon: A.FaColumnsIcon, clips: ["hover: peek", "on: collapse"] },
  { name: 'FaCommentDotsIcon', Icon: A.FaCommentDotsIcon, clips: [] },
  { name: 'FaCopyIcon', Icon: A.FaCopyIcon, clips: ["hover: peel", "click: duplicate"] },
  { name: 'FaDatabaseIcon', Icon: A.FaDatabaseIcon, clips: ["hover: lift", "click: seat"] },
  { name: 'FaDesktopIcon', Icon: A.FaDesktopIcon, clips: ["hover: tap", "click: knock"] },
  { name: 'FaDiscordIcon', Icon: A.FaDiscordIcon, clips: ["hover: tick", "click: press"] },
  { name: 'FaEditIcon', Icon: A.FaEditIcon, clips: ["hover: trace", "click: write"] },
  { name: 'FaEllipsisHIcon', Icon: A.FaEllipsisHIcon, clips: ["hover: roll", "click: open"] },
  { name: 'FaExclamationTriangleIcon', Icon: A.FaExclamationTriangleIcon, clips: [] },
  { name: 'FaExpandIcon', Icon: A.FaExpandIcon, clips: ["hover: out", "on: full"] },
  { name: 'FaExternalLinkAltIcon', Icon: A.FaExternalLinkAltIcon, clips: ["hover: out", "click: open"] },
  { name: 'FiDatabaseIcon', Icon: A.FiDatabaseIcon, clips: ["hover: lift", "click: seat"] },
  { name: 'FiDownloadIcon', Icon: A.FiDownloadIcon, clips: [] },
  { name: 'FaFileAltIcon', Icon: A.FaFileAltIcon, clips: ["hover: tip", "click: knock"] },
  { name: 'FaFileExportIcon', Icon: A.FaFileExportIcon, clips: ["hover: push", "click: send"] },
  { name: 'FaFileVideoIcon', Icon: A.FaFileVideoIcon, clips: ["hover: tip", "click: knock"] },
  { name: 'FaFolderIcon', Icon: A.FaFolderIcon, clips: ["hover: lift", "on: show"] },
  { name: 'FaFolderOpenIcon', Icon: A.FaFolderOpenIcon, clips: ["hover: ajar", "click: open"] },
  { name: 'FaFolderPlusIcon', Icon: A.FaFolderPlusIcon, clips: ["hover: lift", "click: pull"] },
  { name: 'FaGithubIcon', Icon: A.FaGithubIcon, clips: ["hover: tick", "click: press"] },
  { name: 'FaGlobeIcon', Icon: A.FaGlobeIcon, clips: [] },
  { name: 'FaHeartIcon', Icon: A.FaHeartIcon, clips: [] },
  { name: 'FaHistoryIcon', Icon: A.FaHistoryIcon, clips: ["hover: wind", "click: rewind"] },
  { name: 'FaImageIcon', Icon: A.FaImageIcon, clips: ["hover: raise", "click: show"] },
  { name: 'FaInfoIcon', Icon: A.FaInfoIcon, clips: ["hover: tap", "click: say"] },
  { name: 'FaInfoCircleIcon', Icon: A.FaInfoCircleIcon, clips: ["hover: dip", "click: press"] },
  { name: 'IoLibraryIcon', Icon: A.IoLibraryIcon, clips: [] },
  { name: 'FaKeyboardIcon', Icon: A.FaKeyboardIcon, clips: ["hover: tap", "click: type"] },
  { name: 'FaLayerGroupIcon', Icon: A.FaLayerGroupIcon, clips: ["hover: lift", "click: fan"] },
  { name: 'LuFileSearchIcon', Icon: A.LuFileSearchIcon, clips: [] },
  { name: 'MdKeyboardReturnIcon', Icon: A.MdKeyboardReturnIcon, clips: [] },
  { name: 'FaMicrochipIcon', Icon: A.FaMicrochipIcon, clips: ["hover: seat", "click: press-in"] },
  { name: 'FaMinusIcon', Icon: A.FaMinusIcon, clips: ["hover: dip", "click: less"] },
  { name: 'FaPaperPlaneIcon', Icon: A.FaPaperPlaneIcon, clips: ["hover: lift", "click: send"] },
  { name: 'FaPauseIcon', Icon: A.FaPauseIcon, clips: ["hover: grip", "click: hold"] },
  { name: 'FaPencilAltIcon', Icon: A.FaPencilAltIcon, clips: ["hover: press", "click: bear-down"] },
  { name: 'FaPlayIcon', Icon: A.FaPlayIcon, clips: ["hover: lean", "click: go"] },
  { name: 'FaPlusIcon', Icon: A.FaPlusIcon, clips: ["hover: cock", "click: add"] },
  { name: 'FaQuestionCircleIcon', Icon: A.FaQuestionCircleIcon, clips: [] },
  { name: 'FaRedoIcon', Icon: A.FaRedoIcon, clips: ["hover: step", "click: turn"] },
  { name: 'FaRegCalendarAltIcon', Icon: A.FaRegCalendarAltIcon, clips: ["hover: band", "click: raise-band"] },
  { name: 'FaSearchIcon', Icon: A.FaSearchIcon, clips: ["hover: tilt", "click: sweep"] },
  { name: 'FaSearchPlusIcon', Icon: A.FaSearchPlusIcon, clips: ["hover: look", "click: hunt"] },
  { name: 'SiDavinciresolveIcon', Icon: A.SiDavinciresolveIcon, clips: [] },
  { name: 'FaSignOutAltIcon', Icon: A.FaSignOutAltIcon, clips: ["hover: step", "click: leave"] },
  { name: 'FaSlidersHIcon', Icon: A.FaSlidersHIcon, clips: ["hover: touch", "click: set"] },
  { name: 'FaSortAlphaDownIcon', Icon: A.FaSortAlphaDownIcon, clips: ["hover: dip", "click: sort"] },
  { name: 'FaSortAlphaUpIcon', Icon: A.FaSortAlphaUpIcon, clips: ["hover: dip", "click: sort"] },
  { name: 'FaSpinnerIcon', Icon: A.FaSpinnerIcon, clips: ["loop: turn"] },
  { name: 'FaSyncAltIcon', Icon: A.FaSyncAltIcon, clips: ["click: turn", "hover: step"] },
  { name: 'FaTerminalIcon', Icon: A.FaTerminalIcon, clips: ["hover: prompt", "click: run"] },
  { name: 'FaThLargeIcon', Icon: A.FaThLargeIcon, clips: ["hover: narrow", "click: take-all"] },
  { name: 'FaThumbtackIcon', Icon: A.FaThumbtackIcon, clips: ["hover: nudge", "on: pin", "off: unpin"] },
  { name: 'FaTimesIcon', Icon: A.FaTimesIcon, clips: ["hover: twist", "click: close"] },
  { name: 'FaToolboxIcon', Icon: A.FaToolboxIcon, clips: ["hover: lift", "click: open"] },
  { name: 'FaTrashIcon', Icon: A.FaTrashIcon, clips: ["hover: peek", "click: empty"] },
  { name: 'FaTrashAltIcon', Icon: A.FaTrashAltIcon, clips: ["hover: peek", "click: empty"] },
  { name: 'FaTrophyIcon', Icon: A.FaTrophyIcon, clips: [] },
  { name: 'FaUndoIcon', Icon: A.FaUndoIcon, clips: ["hover: step", "click: turn"] },
  { name: 'FaUsersIcon', Icon: A.FaUsersIcon, clips: ["hover: nod", "click: answer"] },
  { name: 'FaVideoIcon', Icon: A.FaVideoIcon, clips: ["hover: nod", "click: press"] },
  { name: 'FaVolumeDownIcon', Icon: A.FaVolumeDownIcon, clips: ["hover: quieten", "click: mute"] },
  { name: 'FaVolumeMuteIcon', Icon: A.FaVolumeMuteIcon, clips: ["hover: give", "click: unmute"] },
  { name: 'FaVolumeUpIcon', Icon: A.FaVolumeUpIcon, clips: ["hover: quieten", "click: mute"] },
  { name: 'FaWaterIcon', Icon: A.FaWaterIcon, clips: ["hover: run", "click: carry"] },
  { name: 'FaWindowsIcon', Icon: A.FaWindowsIcon, clips: ["hover: tick", "click: press"] },
  { name: 'FaWrenchIcon', Icon: A.FaWrenchIcon, clips: ["hover: nod", "click: press"] },
  { name: 'FaYoutubeIcon', Icon: A.FaYoutubeIcon, clips: ["hover: tick", "click: press"] },
];

const chrome: Entry[] = [
  { name: 'PanelLeftIcon (open)', Icon: C.PanelLeftIcon, props: { filled: true }, clips: ['hover: closes', 'press: closes further'] },
  { name: 'PanelLeftIcon (hidden)', Icon: C.PanelLeftIcon, clips: ['hover: opens', 'press: opens further'] },
  { name: 'PanelRightIcon (open)', Icon: C.PanelRightIcon, props: { filled: true }, clips: ['hover: closes', 'press: closes further'] },
  { name: 'PanelRightIcon (hidden)', Icon: C.PanelRightIcon, clips: ['hover: opens', 'press: opens further'] },
  { name: 'GridPreviewIcon', Icon: C.GridPreviewIcon, clips: ['hover: tiles lift in turn', 'press: deeper wave'] },
  { name: 'WindowPinIcon', Icon: C.WindowPinIcon, clips: ['hover: tilts', 'press: drives in'] },
  { name: 'WindowMinimizeIcon', Icon: C.WindowMinimizeIcon, clips: ['hover: bar drops', 'press: winds up, falls'] },
  { name: 'WindowMaximizeIcon', Icon: C.WindowMaximizeIcon, clips: ['hover: frame swells', 'press: dips, fills'] },
  { name: 'WindowMaximizeIcon (restored)', Icon: C.WindowMaximizeIcon, props: { isMaximized: true }, clips: ['hover: pane slides back'] },
  { name: 'WindowCloseIcon', Icon: C.WindowCloseIcon, clips: ['hover: twists', 'press: quarter turn'] },
  { name: 'ZoomOutIcon', Icon: C.ZoomOutIcon, clips: ['hover: bar draws in', 'press: further'] },
  { name: 'ZoomInIcon', Icon: C.ZoomInIcon, clips: ['hover: arms reach out', 'press: further'] },
  { name: 'FolderAddIcon', Icon: C.FolderAddIcon, clips: ['hover: plus lifts', 'press: drops in'] },
  { name: 'DatabaseDownloadIcon', Icon: C.DatabaseDownloadIcon, clips: ['hover: arrow arms back', 'press: drives down'] },
];

function Section({ title, note, items }: { title: string; note: string; items: Entry[] }) {
  return (
    <section>
      <h2>{title} <small>{items.length}</small></h2>
      <p className="note">{note}</p>
      <div className="grid">
        {items.map(({ name, Icon, clips, props }) => (
          <button key={name} type="button" className="tile">
            <span className="glyph"><Icon {...(props ?? {})} /></span>
            <span className="name">{name}</span>
            <span className="clips">{clips.length ? clips.join(' · ') : 'still'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <main>
    <h1>AMVerge animated icons</h1>
    <p className="note">
      Hover a tile, then press it. Each icon follows the button it sits in, so the
      whole tile is the target - that is how they behave in the app.
    </p>
    <Section
      title="Pack"
      note="Generated from the NetsuIcon pack 'amverge'. Drawn at 28 px here; the app draws most of them at 12-17 px."
      items={pack}
    />
    <Section
      title="Chrome"
      note="Hand-drawn in the app, animated in ChromeIcons.tsx. Shown at their own render size."
      items={chrome}
    />
  </main>,
);
