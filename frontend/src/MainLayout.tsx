import React, { useCallback, useEffect, useMemo, useRef } from "react";
import ClipsContainer from "./components/clipsGrid/ClipsContainer";
import PreviewContainer from "./components/previewPanel/PreviewContainer";
import { useAppStateStore } from "./stores/appStore";
import { useUIStateStore } from "./stores/UIStore";

/** Drag the divider past this share of the width and the preview pane folds away. */
const COLLAPSE_AT_PERCENT = 90;

/**
 * `active` is false for a MainLayout whose page is mounted but hidden. HomePage
 * stays mounted behind `display: none` so its grid survives navigation, and the
 * Scenepacks page renders a second MainLayout of its own — both read the same
 * clip store, so both preview players would load the same clip and play its
 * audio at once. `display: none` does not stop media playback.
 */
export default function MainLayout({
    intro = false,
    active = true,
    left,
    previewIdle = false,
}: {
    intro?: boolean;
    active?: boolean;
    /** Replaces the clip grid in the left pane. Events fills it with its own grid. */
    left?: React.ReactNode;
    /** Keeps the preview pane mounted, sized, and collapsible as the user left
     *  it, but showing nothing — the Events page has no clip to preview, and
     *  whatever was playing has to stop. */
    previewIdle?: boolean;
}) {
    // In the store, not local state: the import row above reads it to park the
    // preview toggle over the grid's right edge.
    const leftWidth = useUIStateStore(s => s.previewSplitPct);
    const setLeftWidth = useUIStateStore(s => s.setPreviewSplitPct);
    // Shared by both MainLayout instances (episodes + scenepacks) and persisted, so the
    // pane stays where it was left across navigation and restarts.
    const previewCollapsed = useUIStateStore(s => s.previewCollapsed);
    const setPreviewCollapsed = useUIStateStore(s => s.setPreviewCollapsed);
    const focusedClip = useAppStateStore(s => s.focusedClip);
    const clips = useAppStateStore(s => s.clips);

    const focusedClipThumbnail = useMemo(
        () =>
            focusedClip
                ? clips.find((c) => c.src === focusedClip)?.thumbnail ?? null
                : null,
        [focusedClip, clips]
    );

    const resizeCleanupRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        return () => {
            resizeCleanupRef.current?.();
        };
    }, []);

    const startHorizontalResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const startX = e.clientX;
        const container = e.currentTarget.parentElement as HTMLElement;
        const leftPane = container.children[0] as HTMLElement;
        const startLeftWidth = leftPane.offsetWidth;
        const totalWidth = container.offsetWidth;

        const onMouseMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX;
            const newPercent = ((startLeftWidth + delta) / totalWidth) * 100;
            // Shoving the divider past the last stop folds the pane away, live. The
            // listeners sit on the window, so the drag survives the divider unmounting
            // and pulling back left brings the pane straight back.
            if (newPercent >= COLLAPSE_AT_PERCENT) {
                setPreviewCollapsed(true);
                return;
            }
            setPreviewCollapsed(false);
            setLeftWidth(Math.min(85, Math.max(15, newPercent)));
        };

        const onMouseUp = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            resizeCleanupRef.current = null;
        };

        resizeCleanupRef.current?.();
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        resizeCleanupRef.current = onMouseUp;
    }, [setLeftWidth, setPreviewCollapsed]);

    return (
        <div className="main-layout-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            <div className="split-layout" style={{ flex: 1, minHeight: 0 }}>
                <div
                    className={`left-pane ${intro ? "app-intro" : ""}`}
                    style={{ width: previewCollapsed ? "100%" : `${leftWidth}%`, ...(intro ? { ["--intro-delay" as any]: "80ms" } : {}) }}
                >
                    {left ?? <ClipsContainer />}
                </div>

                {!previewCollapsed && (
                    <div className="divider" onMouseDown={startHorizontalResize}>
                        <span className="subdivider" />
                        <span className="subdivider" />
                    </div>
                )}

                {/* Kept mounted while collapsed: the pane holds the export settings, and
                    `active={false}` is what actually stops the player — `display: none`
                    alone does not. */}
                <div
                    className={`right-pane ${previewCollapsed ? "collapsed" : ""} ${intro ? "app-intro" : ""}`}
                    style={{ width: previewCollapsed ? 0 : `${100 - leftWidth}%`, ...(intro ? { ["--intro-delay" as any]: "180ms" } : {}) }}
                    aria-hidden={previewCollapsed}
                >
                    <PreviewContainer
                        sourceClip={previewIdle ? null : focusedClip}
                        sourceClipThumbnail={previewIdle ? null : focusedClipThumbnail}
                        active={!previewIdle && active && !previewCollapsed}
                    />
                </div>
            </div>
        </div>
    )
}