import { forwardRef } from "react";

import type { FlowSource, MotionTags } from "../../../features/sceneScout/types";
import { cameraLabel, subjectArrow } from "../../../features/sceneScout/motion";
import { useFlowPreviewSrc } from "./useFlowPreviewSrc";

type Props = {
  /** "Your clip" / "Preview" */
  role: string;
  source: FlowSource | null;
  /** which end of the clip the tags describe */
  tagsLabel: "ends" | "starts";
  tags: MotionTags | null;
  /** shown in place of the tags while they are missing, e.g. "reading motion…" */
  tagsNote?: string;
  /** looping is turned off while Preview cut drives the two players */
  loop: boolean;
  empty: string;
  onEnded?: () => void;
  onTimeUpdate?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
};

/** one of the Flow tab's two players: the clip being continued, or the result being previewed */
export const FlowPlayer = forwardRef<HTMLVideoElement, Props>(function FlowPlayer(
  { role, source, tagsLabel, tags, tagsNote, loop, empty, onEnded, onTimeUpdate },
  ref
) {
  const { src, failed } = useFlowPreviewSrc(source);

  return (
    <div className="scene-scout-flow-player">
      <div className="scene-scout-flow-player-head">
        <span className="scene-scout-flow-player-role">{role}</span>
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
          <video
            ref={ref}
            key={src}
            src={src}
            controls
            autoPlay
            muted
            loop={loop}
            playsInline
            onEnded={onEnded}
            onTimeUpdate={onTimeUpdate}
          />
        )}
      </div>

      <div className="scene-scout-flow-player-tags">
        {tags ? (
          <>
            <span>{tagsLabel}</span>
            <b>{subjectArrow(tags.subject)}</b>
            <span>
              {tags.subject === "still" ? "still" : tags.subject === "unclear" ? "unclear" : tags.subject}
              {tags.speed ? `, ${tags.speed}` : ""}
            </span>
            <span className="scene-scout-flow-player-camera">camera {cameraLabel(tags.camera)}</span>
          </>
        ) : (
          <span className="is-muted">{source ? tagsNote ?? "motion not measured" : " "}</span>
        )}
      </div>
    </div>
  );
});
