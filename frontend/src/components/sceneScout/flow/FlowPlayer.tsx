import type { ReactNode } from "react";

import type { FlowSource } from "../../../features/sceneScout/types";
import { useFlowPreviewSrc } from "./useFlowPreviewSrc";

type Props = {
  source: FlowSource | null;
  /** what the empty frame shows before there is a clip: a hint, or the first-visit Choose clip button */
  empty: ReactNode;
};

/** the Flow tab's player for the clip being cut from; the scene to cut into plays in the preview pane */
export function FlowPlayer({ source, empty }: Props) {
  const { src, failed } = useFlowPreviewSrc(source);

  return (
    <div className="scene-scout-flow-player">
      <div className="scene-scout-flow-player-head">
        <span className="scene-scout-flow-player-role">Inputted clip</span>
        {source && (
          <span className="scene-scout-flow-player-name" title={source.path}>
            {source.label}
          </span>
        )}
      </div>

      <div className="scene-scout-flow-player-frame">
        {!source ? (
          <div className="scene-scout-flow-player-empty">{empty}</div>
        ) : failed ? (
          <div className="scene-scout-flow-player-empty">Could not prepare a preview of this clip.</div>
        ) : !src ? (
          <div className="scene-scout-flow-player-empty is-loading">Preparing preview…</div>
        ) : (
          <video key={src} src={src} controls autoPlay muted loop playsInline />
        )}
      </div>
    </div>
  );
}
