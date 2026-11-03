import { useEffect, useState } from "react";
import { FaBars, FaDiscord } from './icons/animated';
import { WindowCloseIcon, WindowMaximizeIcon, WindowMinimizeIcon, WindowPinIcon, ZoomInIcon, ZoomOutIcon } from './icons/chrome/ChromeIcons';
import Tooltip from "./common/Tooltip";
import { MAX_EVENT_COLUMNS } from "./events/EventsBrowser";
import { useUIStateStore } from "../stores/UIStore";
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
    // the same quick navigation that Escape opens
    const setQuickMenuOpen = useUIStateStore((s) => s.setQuickMenuOpen);
    const activePage = useUIStateStore((s) => s.activePage);

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

    // the pin preference persists but the window state doesn't, so it is re-applied on mount and toggle
    useEffect(() => {
        void getCurrentWindow().setAlwaysOnTop(pinned).catch(() => {});
    }, [pinned]);

    // the zoom control stops at the events grid's lower column cap
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
                <Tooltip content="Quick navigation (Esc)" side="bottom">
                    <button
                        type="button"
                        className="navbar-menu-btn"
                        onClick={() => setQuickMenuOpen(true)}
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
                    <FaDiscord size={22} aria-hidden="true" />
                </a>
                </Tooltip>
            </div>

            <div className="navbar-center" data-tauri-drag-region>
                <div className="zoomWrapper" data-tauri-drag-region>
                    <Tooltip content="Bigger tiles, fewer columns" side="bottom">
                        <button type="button" className="zoom-btn" onClick={handleBigger} aria-label="Bigger tiles, fewer columns">
                            <ZoomOutIcon />
                        </button>
                    </Tooltip>
                    <span className="zoom-label">Grid: <strong>{cols}</strong> cols</span>
                    <Tooltip content="Smaller tiles, more columns" side="bottom">
                        <button type="button" className="zoom-btn" onClick={handleSmaller} aria-label="Smaller tiles, more columns">
                            <ZoomInIcon />
                        </button>
                    </Tooltip>
                </div>
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
                        <WindowPinIcon pinned={pinned} />
                    </button>
                </Tooltip>

                <Tooltip content="Minimize" placement="bottom-end">
                    <button
                        type="button"
                        className="window-control minimize"
                        onClick={handleMinimize}
                        aria-label="Minimize"
                    >
                        <WindowMinimizeIcon />
                    </button>
                </Tooltip>
                <Tooltip content={isMaximized ? "Restore" : "Maximize"} placement="bottom-end">
                    <button
                        type="button"
                        className="window-control maximize"
                        onClick={handleToggleMaximize}
                        aria-label={isMaximized ? "Restore" : "Maximize"}
                    >
                        <WindowMaximizeIcon isMaximized={isMaximized} />
                    </button>
                </Tooltip>
                <Tooltip content="Close" placement="bottom-end">
                    <button
                        type="button"
                        className="window-control close"
                        onClick={handleClose}
                        aria-label="Close"
                    >
                        <WindowCloseIcon />
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}
