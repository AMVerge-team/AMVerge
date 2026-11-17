import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FaEye, FaEyeSlash } from "../icons/animated";

import { useEscapeToClose } from "../common/useEscapeToClose";
import { samePath, useSceneScoutStore } from "../../stores/sceneScoutStore";
import type { ScoutDatabase } from "../../features/sceneScout/types";

const POP_WIDTH = 280;

type Props = {
  database: ScoutDatabase;
  anchor: HTMLElement;
  onClose: () => void;
};

/** which of a searched database's episodes scene scout looks through; hidden ones are left out of every search */
export function EpisodeVisibilityPopover({ database, anchor, onClose }: Props) {
  const { t } = useTranslation("scout");
  const videos = useSceneScoutStore((s) => s.videosByDatabase[database.path]);
  const hiddenVideos = useSceneScoutStore((s) => s.hiddenVideos);
  const setVideosHidden = useSceneScoutStore((s) => s.setVideosHidden);
  const loadVideos = useSceneScoutStore((s) => s.loadVideos);
  const label = useSceneScoutStore((s) => s.displayNames[database.path] ?? database.name);

  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!videos) void loadVideos(database.path);
  }, [videos, loadVideos, database.path]);

  // pinned under the eye but rendered on body, so the panel's scroll box never clips it
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - POP_WIDTH, window.innerWidth - POP_WIDTH - 8)),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [anchor, onClose]);

  useEscapeToClose(onClose, true);

  const list = videos ?? [];
  const isHidden = (path: string) => hiddenVideos.some((h) => samePath(h, path));
  const shownCount = list.filter((v) => !isHidden(v.filepath)).length;
  const allPaths = list.map((v) => v.filepath);

  if (!pos) return null;
  return createPortal(
    <div
      ref={popRef}
      className="scene-scout-options-pop scout-visibility-pop"
      style={{ top: pos.top, left: pos.left, width: POP_WIDTH }}
      role="dialog"
      aria-label={t("visibility.ariaLabel", { name: label })}
    >
      <div className="scout-visibility-head">
        <span className="scout-visibility-title" title={label}>{label}</span>
        <span className="scout-visibility-count">
          {shownCount}/{list.length}
        </span>
        <button type="button" className="scout-visibility-all" onClick={() => setVideosHidden(allPaths, false)}>
          {t("visibility.showAll")}
        </button>
        <button type="button" className="scout-visibility-all" onClick={() => setVideosHidden(allPaths, true)}>
          {t("visibility.hideAll")}
        </button>
      </div>

      <div className="scout-visibility-list">
        {!videos && <div className="scout-visibility-empty">{t("visibility.loading")}</div>}
        {videos && list.length === 0 && <div className="scout-visibility-empty">{t("visibility.empty")}</div>}
        {list.map((video) => {
          const hidden = isHidden(video.filepath);
          return (
            <button
              key={video.id}
              type="button"
              className={`scout-visibility-row${hidden ? " is-hidden" : ""}`}
              onClick={() => setVideosHidden([video.filepath], !hidden)}
              title={video.filepath}
              aria-pressed={!hidden}
            >
              {hidden ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
              <span className="scout-visibility-name">{video.name}</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export default EpisodeVisibilityPopover;
