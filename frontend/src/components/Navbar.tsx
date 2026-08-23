import { useEffect, useState } from "react";
import Tooltip from "./common/Tooltip";
import { useUIStateStore } from "../stores/UIStore";
import { open } from "@tauri-apps/plugin-shell";
import { getCurrentWindow } from "@tauri-apps/api/window";

type NavbarProps = {
    setSidebarEnabled: (val: boolean | ((prev: boolean) => boolean)) => void
    sidebarEnabled: boolean
    userHasHEVC: boolean
    videoIsHEVC: boolean | null
}
export default function Navbar({ setSidebarEnabled, sidebarEnabled }: NavbarProps ) {
    const cols = useUIStateStore((s: any) => s.cols);
    const setCols = useUIStateStore((s: any) => s.setCols);

    const [isMaximized, setIsMaximized] = useState(false);

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

    const handleBigger = () => setCols(Math.max(1, cols - 1));
    const handleSmaller = () => setCols(Math.min(12, cols + 1));

    const handleMinimize = () => void getCurrentWindow().minimize();
    const handleToggleMaximize = () => void getCurrentWindow().toggleMaximize();
    const handleClose = () => void getCurrentWindow().close();

    return (
        <div className="navbar" data-tauri-drag-region>
            <div className="left-nav" data-tauri-drag-region>
                <Tooltip content={sidebarEnabled ? "Hide sidebar" : "Show sidebar"} side="bottom">
                    <svg
                        onClick={() => setSidebarEnabled(prev => !prev)}
                        width="24" height="24" viewBox="0 0 24 24"
                        fill="none" xmlns="http://www.w3.org/2000/svg"
                        role="button"
                        aria-label={sidebarEnabled ? "Hide sidebar" : "Show sidebar"}
                        style={{ transform: sidebarEnabled ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                    >
                        <path d="M9 6l6 6-6 6" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
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

            <div className="zoomWrapper">
                <span>Grid: {cols} columns</span>
                <form>
                <Tooltip content="Bigger tiles, fewer columns" side="bottom">
                    <button type="button" onClick={handleBigger} aria-label="Bigger tiles, fewer columns">-</button>
                </Tooltip>
                <Tooltip content="Smaller tiles, more columns" side="bottom">
                    <button type="button" onClick={handleSmaller} aria-label="Smaller tiles, more columns">+</button>
                </Tooltip>
                </form>
            </div>

            {/* window controls sit against the top-right corner: anchoring the
                bubbles below and right-aligned keeps them off both edges */}
            <div className="window-controls">
                <Tooltip content="Minimize" placement="bottom-end">
                    <button
                        type="button"
                        className="window-control"
                        onClick={handleMinimize}
                        aria-label="Minimize"
                    >
                        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                            <line x1="0" y1="5" x2="10" y2="5" />
                        </svg>
                    </button>
                </Tooltip>
                <Tooltip content={isMaximized ? "Restore" : "Maximize"} placement="bottom-end">
                    <button
                        type="button"
                        className="window-control"
                        onClick={handleToggleMaximize}
                        aria-label={isMaximized ? "Restore" : "Maximize"}
                    >
                        {isMaximized ? (
                            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                                <rect x="0.5" y="0.5" width="7" height="7" />
                                <rect x="2.5" y="2.5" width="7" height="7" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                                <rect x="0.5" y="0.5" width="9" height="9" />
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
                        <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                            <line x1="1" y1="1" x2="9" y2="9" />
                            <line x1="9" y1="1" x2="1" y2="9" />
                        </svg>
                    </button>
                </Tooltip>
            </div>
        </div>
    )
}
