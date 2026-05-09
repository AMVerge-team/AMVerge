import React from "react";
import Sidebar from "./sidebar/Sidebar";
import Navbar from "./Navbar";
import { convertFileSrc } from "@tauri-apps/api/core";
import { isVideoBackgroundPath, useThemeSettingsStore } from "../stores/settingsStore";

export interface AppLayoutProps {
  windowWrapperRef: React.RefObject<HTMLDivElement | null>;
  sidebarEnabled: boolean;
  navbarProps: React.ComponentProps<typeof Navbar>;
  dividerProps: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    dividerOffsetPx: number;
    sidebarWidthPx: number;
  };
  children: React.ReactNode;
  loadingOverlay?: React.ReactNode;
  isDragging: boolean;
}

export default function AppLayout({
  windowWrapperRef,
  sidebarEnabled,
  navbarProps,
  dividerProps,
  children,
  loadingOverlay,
  isDragging,
}: AppLayoutProps) {
  const backgroundMediaPath = useThemeSettingsStore((s) => s.backgroundImagePath);
  const backgroundVideoSrc = React.useMemo(() => {
    if (!backgroundMediaPath || !isVideoBackgroundPath(backgroundMediaPath)) {
      return null;
    }

    const [cleanPath, query] = backgroundMediaPath.split("?");
    const src = convertFileSrc(cleanPath);
    return query ? `${src}?${query}` : src;
  }, [backgroundMediaPath]);

  return (
    <main className="app-root">
      {backgroundVideoSrc && (
        <video
          className="app-bg-video"
          src={backgroundVideoSrc}
          autoPlay
          muted
          loop
          playsInline
        />
      )}
      {loadingOverlay}
      {isDragging && (
        <div className="dragging-overlay">
          <h1>Drag file(s) here.</h1>
        </div>
      )}
      <div
        className="window-wrapper"
        ref={windowWrapperRef}
        style={{
          ["--amverge-sidebar-width" as any]: `${dividerProps.sidebarWidthPx}px`,
          ["--amverge-divider-offset" as any]: `${dividerProps.dividerOffsetPx}px`,
        }}
      >
        {sidebarEnabled && (
          <>
            <Sidebar />
            <div
              className="divider sidebar-splitter"
              onPointerDown={dividerProps.onPointerDown}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              tabIndex={-1}
            >
              <span className="subdivider" />
              <span className="subdivider" />
            </div>
          </>
        )}
        <div className="content-wrapper">
          <Navbar {...navbarProps} />
          {children}
        </div>
      </div>
    </main>
  );
}
