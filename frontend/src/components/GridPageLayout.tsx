import type { ReactNode } from "react";
import ImportButtons from "./ImportButtons";
import MainLayout from "../MainLayout";

type GridPageLayoutProps = {
  /** false while the page is mounted but covered, so previews stand down */
  active: boolean;
  intro?: boolean;
  showImportControls?: boolean;
  /** left side of the info bar - episode filename, or the scenepack's name */
  infoText?: ReactNode;
};

/** the frame both clip pages share: import row, grid/preview split with divider, info bar */
export default function GridPageLayout({
  active,
  intro = false,
  showImportControls = true,
  infoText,
}: GridPageLayoutProps) {
  return (
    <>
      <div
        className={intro ? "app-intro" : undefined}
        style={intro ? { ["--intro-delay" as any]: "0ms" } : undefined}
      >
        <ImportButtons showImportControls={showImportControls} />
      </div>

      <div className="main-layout-wrapper">
        <MainLayout intro={intro} active={active} />

        <div
          className={`info-bar ${intro ? "app-intro" : ""}`}
          style={intro ? { ["--intro-delay" as any]: "260ms" } : undefined}
        >
          {infoText ? <span className="info-bar-filename">{infoText}</span> : null}
        </div>
      </div>
    </>
  );
}
