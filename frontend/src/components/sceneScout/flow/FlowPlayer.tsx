import type { ReactNode } from "react";

import VideoPlayer from "../../previewPanel/VideoPlayer";
import LoadingSpinner from "../../common/LoadingSpinner";
import type { FlowSource } from "../../../features/sceneScout/types";
import { useFlowPreviewSrc } from "./useFlowPreviewSrc";

type Props = {
  source: FlowSource | null;
  /** what the empty frame shows before there is a clip */
  empty: ReactNode;
};

/** the Flow tab's player for the clip being cut from; the scene to cut into plays in the preview pane */
export function FlowPlayer({ source, empty }: Props) {
  const { src, failed } = useFlowPreviewSrc(source);

  return (
    // the room the resizer leaves; the box inside is the largest label + 16:9 video that fits it
    <div className="scene-scout-flow-player">
      <div className="scene-scout-flow-player-box">
        <span className="scene-scout-flow-player-role">Inputted clip</span>

        <div className="scene-scout-flow-player-frame">
          {!source ? (
            <div className="scene-scout-flow-player-empty">{empty}</div>
          ) : failed ? (
            <div className="scene-scout-flow-player-empty">Could not prepare a preview of this clip.</div>
          ) : !src ? (
            <div className="scene-scout-flow-player-empty">
              <LoadingSpinner label="Preparing preview" />
            </div>
          ) : (
            // same custom player and timebar as the preview pane, always silent so it never talks over the match
            <VideoPlayer key={src} src={src} volume={0} silent />
          )}
        </div>
      </div>
    </div>
  );
}
