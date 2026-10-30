import React, { useCallback, useEffect, useMemo, useRef } from "react";
import ClipsContainer from "./components/clipsGrid/ClipsContainer";
import PreviewContainer from "./components/previewPanel/PreviewContainer";
import { useAppStateStore } from "./stores/appStore";
import { useUIStateStore } from "./stores/UIStore";
import { useViewportAlignedDivider } from "./hooks/useViewportAlignedDivider";
import { imageThumbnail } from "./utils/mediaSrc";

/** drag the divider past this share of the width and the preview pane folds away */
const COLLAPSE_AT_PERCENT = 90;

/** `active` is false for a mounted but hidden layout, whose player must stand down (display:none keeps playing) */
export default function MainLayout({
    intro = false,
    active = true,
    left,
    previewIdle = false,
    fullWidth = false,
}: {
    intro?: boolean;
    active?: boolean;
    /** replaces the clip grid in the left pane. Events fills it with its own grid */
    left?: React.ReactNode;
    /** drops the preview pane and divider for pages with nothing to preview */
    fullWidth?: boolean;
    /** keeps the pane as the user left it but empty (Events) */
    previewIdle?: boolean;
}) {
    // in the store so the import row can park the preview toggle over the grid's edge
    const leftWidth = useUIStateStore(s => s.previewSplitPct);
    const setLeftWidth = useUIStateStore(s => s.setPreviewSplitPct);
    // shared and persisted, so the pane stays put across pages and restarts
    const previewCollapsed = useUIStateStore(s => s.previewCollapsed);
    const setPreviewCollapsed = useUIStateStore(s => s.setPreviewCollapsed);
    const focusedClip = useAppStateStore(s => s.focusedClip);
    const focusedClipId = useAppStateStore(s => s.focusedClipId);
    const clips = useAppStateStore(s => s.clips);

    const focusedClipThumbnail = useMemo(
        () => {
            // only real images: an old webp episode's "thumbnail" is the source video itself
            if (focusedClipId) {
                const byId = imageThumbnail(clips.find((c) => c.id === focusedClipId)?.thumbnail);
                if (byId) return byId;
            }
            return focusedClip
                ? imageThumbnail(clips.find((c) => c.src === focusedClip)?.thumbnail) ?? null
                : null;
        },
        [focusedClip, focusedClipId, clips]
    );

    const resizeCleanupRef = useRef<(() => void) | null>(null);
    const alignDivider = useViewportAlignedDivider();

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
            // past the last stop the pane folds away live; pulling back brings it straight back
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
                    style={{ width: fullWidth || previewCollapsed ? "100%" : `${leftWidth}%`, ...(intro ? { ["--intro-delay" as any]: "80ms" } : {}) }}
                >
                    {left ?? <ClipsContainer />}
                </div>

                {/* stays when the pane is folded, parked at the right edge to drag it back out */}
                {!fullWidth && (
                    <div ref={alignDivider} className="divider" onMouseDown={startHorizontalResize} />
                )}

                {/* Kept mounted while collapsed: the pane holds the export settings, and
                    `active={false}` is what actually stops the player, `display: none`
                    alone does not. Unmounted outright in full-width mode, which is the
                    one case where nothing on the page can ever need it. */}
                {!fullWidth && (
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
                )}
            </div>
        </div>
    )
}