import { useEffect, useState } from "react";
import { FaBars } from "react-icons/fa";
import Tooltip from "./common/Tooltip";
import { MAX_EVENT_COLUMNS } from "./events/EventsBrowser";
import { useUIStateStore } from "../stores/UIStore";
import { useAppStateStore } from "../stores/appStore";
import { useAiDepsStore } from "../stores/aiDepsStore";
import { open } from "@tauri-apps/plugin-shell";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyWindowSize, readWinSize, rememberWinSize } from "../utils/windowSize";

type NavbarProps = {
    userHasHEVC: boolean
    videoIsHEVC: boolean | null
}
export default function Navbar({}: NavbarProps) {
    const cols = useUIStateStore((s: any) => s.cols);
    const setCols = useUIStateStore((s: any) => s.setCols);
    const pinned = useUIStateStore((s: any) => s.pinned);
    const togglePinned = useUIStateStore((s: any) => s.togglePinned);
    const openMenu = useUIStateStore((s) => s.openMenu);
    const activePage = useUIStateStore((s) => s.activePage);

    const clips = useAppStateStore(s => s.clips);
    const selectedClips = useAppStateStore(s => s.selectedClips);
    const refreshAiStatus = useAiDepsStore(s => s.refresh);

    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        void refreshAiStatus();
    }, [refreshAiStatus]);

    useEffect(() => {
        const appWindow = getCurrentWindow();
        let unlisten: (() => void) | undefined;

        const refresh = () => {
            void appWindow.isMaximized().then(setIsMaximized);
        };
        refresh();

        void appWindow.onResized(refresh).then((fn) => {
            unlisten = fn;
        });

        return () => unlisten?.();
    }, []);

    // the pin preference is persisted, the Tauri window state is not: re-apply it on
    // mount and on every toggle
    useEffect(() => {
        void getCurrentWindow().setAlwaysOnTop(pinned).catch(() => {});
    }, [pinned]);

    // the events grid caps at fewer columns than the clip grid, so the zoom
    // control stops where that page actually stops rather than appearing dead
    const maxCols = activePage === "events" ? MAX_EVENT_COLUMNS : 9;
    const handleSmaller = () => setCols(Math.min(cols + 1, maxCols));
    const handleBigger = () => setCols(Math.max(cols - 1, 1));

    const handleTogglePin = () => {
        const next = !pinned;
        rememberWinSize(next ? "free" : "pinned");
        togglePinned();
        const { w, h } = readWinSize(next ? "pinned" : "free");
        void applyWindowSize(w, h);
    };

    const handleMinimize = () => void getCurrentWindow().minimize();
    const handleToggleMaximize = () => void getCurrentWindow().toggleMaximize();
    const handleClose = () => void getCurrentWindow().close();

    return (
        <div className="navbar" data-tauri-drag-region>
            <div className="left-nav" data-tauri-drag-region>
                <Tooltip content="Menu" side="bottom">
                    <button
                        type="button"
                        className="navbar-menu-btn"
                        onClick={openMenu}
                        aria-label="Menu"
                    >
                        <FaBars aria-hidden="true" />
                    </button>
                </Tooltip>
                <h1 data-tauri-drag-region><span>AMV</span>erge</h1>
                <Tooltip content="Join AMVerge Discord" side="bottom">
                <a
                    className="discord-link"
                    href="#"
                    aria-label="Join AMVerge Discord"
                    onClick={(e) => {
                        e.preventDefault();
                        void open("https://discord.gg/bmXjTgsAaN");
                    }}
                >
                    <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.078.037c-.212.375-.447.864-.612 1.249a18.27 18.27 0 0 0-5.487 0c-.165-.394-.408-.874-.62-1.249a.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 13.83 13.83 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.101 13.101 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .03-.055c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.418 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.094 2.157 2.418 0 1.333-.947 2.418-2.157 2.418Z" />
                    </svg>
                </a>
                </Tooltip>
            </div>

            <div className="navbar-center" data-tauri-drag-region>
                <div className="zoomWrapper" data-tauri-drag-region>
                    <Tooltip content="Bigger tiles, fewer columns" side="bottom">
                        <button type="button" className="zoom-btn" onClick={handleBigger} aria-label="Bigger tiles, fewer columns">
                            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="3" y1="8" x2="13" y2="8" />
                            </svg>
                        </button>
                    </Tooltip>
                    <span className="zoom-label">Grid: <strong>{cols}</strong> cols</span>
                    <Tooltip content="Smaller tiles, more columns" side="bottom">
                        <button type="button" className="zoom-btn" onClick={handleSmaller} aria-label="Smaller tiles, more columns">
                            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="8" y1="3" x2="8" y2="13" />
                                <line x1="3" y1="8" x2="13" y2="8" />
                            </svg>
                        </button>
                    </Tooltip>
                </div>

                {clips.length > 0 && (
                    <div className="navbar-selection-badge" data-tauri-drag-region>
                        <span className="selection-badge-dot" />
                        <span className="selection-badge-text">
                            <strong>{selectedClips.size}</strong> / {clips.length} selected
                        </span>
                    </div>
                )}
            </div>

            <div className="window-controls" data-tauri-drag-region>
                <Tooltip content={pinned ? "Unpin window" : "Keep window on top"} placement="bottom-end">
                    <button
                        type="button"
                        className={`window-control pin-btn${pinned ? " pinned" : ""}`}
                        onClick={handleTogglePin}
                        aria-label={pinned ? "Unpin window" : "Keep window on top"}
                        aria-pressed={pinned}
                    >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 17v5" />
                            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                        </svg>
                    </button>
                </Tooltip>

                <Tooltip content="Minimize" placement="bottom-end">
                    <button
                        type="button"
                        className="window-control minimize"
                        onClick={handleMinimize}
                        aria-label="Minimize"
                    >
                        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <line x1="1" y1="6" x2="11" y2="6" />
                        </svg>
                    </button>
                </Tooltip>
                <Tooltip content={isMaximized ? "Restore" : "Maximize"} placement="bottom-end">
                    <button
                        type="button"
                        className="window-control maximize"
                        onClick={handleToggleMaximize}
                        aria-label={isMaximized ? "Restore" : "Maximize"}
                    >
                        {isMaximized ? (
                            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2">
                                <rect x="3" y="1" width="8" height="8" rx="1.5" />
                                <path d="M1 4v6a1 1 0 0 0 1 1h6" strokeLinecap="round" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2">
                                <rect x="1.5" y="1.5" width="9" height="9" rx="2" />
                            </svg>
                        )}
                    </button>
                </Tooltip>
                <Tooltip content="Close" placement="bottom-end">
                    <button
                        type="button"
                        className="window-control close"
                        onClick={handleClose}
                        aria-label="Close"
                    >
                        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <line x1="2" y1="2" x2="10" y2="10" />
                            <line x1="10" y1="2" x2="2" y2="10" />
                        </svg>
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}
