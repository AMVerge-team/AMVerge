import VideoPlayer from "../components/VideoPlayer.tsx"
import InfoBox from "../components/InfoBox.tsx"
import React from "react";
type PreviewContainerProps = {
  focusedClip: string | null;
  focusedClipThumbnail: string | null;
  selectedClips: Set<string>;
  videoIsHEVC: boolean | null;
  userHasHEVC: React.RefObject<boolean>;
  importToken: string;
  handleExport: (
    selectedClips: Set<string>,
    enableMerged: boolean
  ) => Promise<void>;
  exportDir: string | null;
  onPickExportDir: () => void;
  onExportDirChange: (dir: string) => void;
};

export default function PreviewContainer (props: PreviewContainerProps) {
  const [mergeEnabled, setMergeEnabled] = React.useState(true);
  const onExportClick = () => {
    props.handleExport(props.selectedClips, mergeEnabled);
  }
  return (
    <main  className="preview-container" >
      <div className="preview-window">
        {props.focusedClip ? (
          <VideoPlayer 
           selectedClip={props.focusedClip}
           videoIsHEVC={props.videoIsHEVC}
           userHasHEVC={props.userHasHEVC}
           posterPath={props.focusedClipThumbnail}
           importToken={props.importToken}
          />
          ) : (
            <p>No clip selected</p>
        )}
      </div>
      <div className="preview-export">
        <div className="checkbox-row">
          <label className="custom-checkbox">
            <input 
              type="checkbox"
              className="checkbox"
              checked={mergeEnabled}
              onChange={(e) => setMergeEnabled(e.target.checked)}
            />
            <span className="checkmark"></span>
          </label>
          <p>Merge clips</p>
        </div>
        <div className="export-dir-row">
          <input
            type="text"
            className="export-dir-input"
            placeholder="Output directory..."
            value={props.exportDir || ""}
            onChange={(e) => props.onExportDirChange(e.target.value)}
          />
          <button
            className="buttons export-dir-browse"
            onClick={props.onPickExportDir}
            title="Browse for output folder"
          >
            Set Export Dir
          </button>
        </div>
        <button 
          className="buttons" 
          id="file-button"
          onClick={onExportClick}
        >
          Export
        </button>
      </div>
      
      <InfoBox/>
    </main>
  );
}