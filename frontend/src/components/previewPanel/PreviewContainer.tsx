import HowToUse from "./HowToUse.tsx"
import VideoPlayer from "./VideoPlayer.tsx"
import React from "react";
import { useTranslation } from "react-i18next";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { FaFolderOpen, FaFileExport, FaPencilAlt } from '../icons/animated';
import { SiDavinciresolve } from '../icons/animated';
import Dropdown from "../common/Dropdown";
import { useDavinciAvailable } from "../../features/davinci/useDavinciAvailable.ts";
import Tooltip from "../common/Tooltip";
import { useEscapeToClose } from "../common/useEscapeToClose";
import { useAppStateStore } from "../../stores/appStore.ts";
import { useAppPersistedStore } from "../../stores/appStore.ts";
import { useUIStateStore } from "../../stores/UIStore.ts";
import { useGeneralSettingsStore } from "../../stores/settingsStore.ts";
import { usePreviewTranscode } from "../../features/preview/usePreviewTranscode.ts";
import LoadingSpinner from "../common/LoadingSpinner";
import { imageThumbnail, mediaSrcVersioned } from "../../utils/mediaSrc";
import { anyPassEnabled } from "../../features/export/postPasses";
import { useEpisodePanelRuntimeStore } from "../../stores/episodeStore.ts";
import { useScenePreviewStore } from "../../stores/scenePreviewStore.ts";
import { clampWebpEnd, webpFpsForRange } from "../clipsGrid/webpQueueUtils.ts";
import useImportExport from "../../hooks/useImportExport";
import { renderProfileIcon } from "../../features/export/profileIconUtils.tsx";
import {
  getActiveExportProfile,
  getExportProfileSummary,
} from "../../features/export/profiles.ts";

type PreviewAudioStream = {
  audioStreamIndex: number;
  label: string;
  /** just the language name, e.g. "English" */
  languageLabel: string;
  /** the track's own title, which is what tells two same-language tracks apart */
  title: string;
  language: string;
};

type PreviewContainerProps = {
  sourceClip: string | null;
  sourceClipThumbnail: string | null;
  onTimeUpdate?: (time: number) => void;
  /** false when this preview belongs to a mounted-but-hidden page; the video
   * player is skipped so two pages can't play the same clip's audio at once */
  active?: boolean;
};

export default function PreviewContainer(props: PreviewContainerProps) {
  const { t } = useTranslation("preview");
  const [showMergeNameModal, setShowMergeNameModal] = React.useState(false);
  useEscapeToClose(() => setShowMergeNameModal(false), showMergeNameModal);
  const mergeNameInputRef = React.useRef<HTMLInputElement | null>(null);

  const clips = useAppStateStore(s => s.clips);
  const selectedClips = useAppStateStore(s => s.selectedClips);
  const importedVideoPath = useAppStateStore(s => s.importedVideoPath);
  const focusedClipId = useAppStateStore(s => s.focusedClipId);

  const importToken = useAppStateStore(s => s.importToken);
  const exportDir = useAppPersistedStore(s => s.exportDir);
  const setExportDir = useAppPersistedStore(s => s.setExportDir);
  const openSettings = useUIStateStore(s => s.openSettings);
  const generalSettings = useGeneralSettingsStore();
  const setActiveExportProfileId = useGeneralSettingsStore(s => s.setActiveExportProfileId);
  const mergeClipsEnabled = useGeneralSettingsStore(s => s.mergeClipsEnabled);
  const setMergeClipsEnabled = useGeneralSettingsStore(s => s.setMergeClipsEnabled);
  const postExportPassesEnabled = useGeneralSettingsStore(s => s.postExportPassesEnabled);
  const setPostExportPassesEnabled = useGeneralSettingsStore(s => s.setPostExportPassesEnabled);
  const davinciExportSelected = useGeneralSettingsStore(s => s.davinciExportSelected);
  const setDavinciExportSelected = useGeneralSettingsStore(s => s.setDavinciExportSelected);
  const previewAudioStreamIndex = useGeneralSettingsStore(s => s.previewAudioStreamIndex);
  const setPreviewAudioLanguage = useGeneralSettingsStore(s => s.setPreviewAudioLanguage);
  const setPreviewAudioStreamIndex = useGeneralSettingsStore(s => s.setPreviewAudioStreamIndex);
  const importMethod = useGeneralSettingsStore(s => s.importMethod);
  const davinciAvailable = useDavinciAvailable();
  const { handleExport, handlePickExportDir } = useImportExport();
  const [audioStreams, setAudioStreams] = React.useState<PreviewAudioStream[]>([]);
  const openedEpisodeId = useEpisodePanelRuntimeStore(s => s.openedEpisodeId);
  const episodes = useEpisodePanelRuntimeStore(s => s.episodes);
  const openedEpisode = React.useMemo(
    () => episodes.find((episode) => episode.id === openedEpisodeId),
    [episodes, openedEpisodeId]
  );
  const previewMethod = openedEpisode?.importMethod ?? importMethod;
  // pack clips are always materialized videos, whatever import method their episode used
  const activePageForPreview = useUIStateStore(s => s.activePage);
  const webpPreviewMode =
    activePageForPreview === "scenepacks" || activePageForPreview === "sceneScout"
      ? false
      : previewMethod === "webp_files";

  const defaultMergedName = (clips[0]?.originalName || "episode").replace(/\.[^./\\]+$/, "") + "_merged";
  const activeExportProfile = React.useMemo(
    () => getActiveExportProfile(generalSettings.exportProfiles, generalSettings.activeExportProfileId),
    [generalSettings.exportProfiles, generalSettings.activeExportProfileId]
  );
  const exportProfileOptions = React.useMemo(
    () =>
      generalSettings.exportProfiles.map((profile) => ({
        value: profile.id,
        label: profile.name.trim() || t("export.untitledProfile"),
        description: getExportProfileSummary(profile),
        icon: renderProfileIcon(profile),
      })),
    [generalSettings.exportProfiles, t]
  );

  const audioStreamOptions = React.useMemo(
    () =>
      audioStreams.map((stream) => ({
        value: stream.audioStreamIndex,
        // the language alone keeps the closed picker short; the title moves to the option description
        label: stream.languageLabel || stream.label,
        description: stream.title || undefined,
      })),
    [audioStreams]
  );

  const hasSelectedClips = selectedClips.size > 0;

  // only the focused clip's preview, so grid WebP results don't re-render the panel
  const previewImageSrc = useScenePreviewStore(s =>
    focusedClipId ? (s.animatedByClipId[focusedClipId] ?? null) : null
  );

  const sourceClipObj = React.useMemo(
    () => (focusedClipId ? clips.find(c => c.id === focusedClipId) ?? null : null),
    [clips, focusedClipId]
  );
  const hasSource = !!props.sourceClip && !!sourceClipObj;

  // the clip's jpg poster covers the panel while its video loads, so a click never shows black
  const posterPath = imageThumbnail(sourceClipObj?.thumbnail);
  const previewPoster = posterPath ? mediaSrcVersioned(posterPath, importToken) : undefined;

  const { needed: configuredTranscode, preset: transcodePreset } = usePreviewTranscode();

  // an uncut scene plays straight from its source episode, seeked to its range, which is instant.
  // only a scout result or a source the webview can't decode (10-bit hevc, xvid) waits on the short
  // x264 range cut; doing that for every uncut clip ran an ffmpeg encode per click during imports
  const sceneRange =
    !sourceClipObj?.clipPath &&
    !webpPreviewMode &&
    (Boolean(sourceClipObj?.database) || configuredTranscode) &&
    sourceClipObj?.startSec !== undefined &&
    sourceClipObj?.endSec !== undefined &&
    sourceClipObj.endSec > sourceClipObj.startSec
      ? { videoPath: sourceClipObj.src, startSec: sourceClipObj.startSec, endSec: sourceClipObj.endSec }
      : null;
  const sceneRangeKey = sceneRange ? `${sceneRange.videoPath}|${sceneRange.startSec}|${sceneRange.endSec}` : null;
  const [sceneRangeCut, setSceneRangeCut] = React.useState<{ key: string; path: string } | null>(null);
  const sceneRangeSrc = sceneRangeCut && sceneRangeCut.key === sceneRangeKey ? sceneRangeCut.path : null;
  const [sceneRangeErrorKey, setSceneRangeErrorKey] = React.useState<string | null>(null);
  const sceneRangeFailed = sceneRangeKey !== null && sceneRangeErrorKey === sceneRangeKey;

  const previewVideoSrc = sceneRange ? sceneRangeSrc : (sourceClipObj?.clipPath || props.sourceClip);
  // range previews start at zero like materialized clips
  const isCutClip = Boolean(sourceClipObj?.clipPath) || Boolean(sceneRange);
  const sceneStartTime = isCutClip ? undefined : sourceClipObj?.startSec;
  const sceneEndTime = isCutClip ? undefined : sourceClipObj?.endSec;

  // a non-default Preview Language needs its audio track remuxed in
  const selectedMappedAudioStreamIndex =
    previewAudioStreamIndex !== null && previewAudioStreamIndex > 0 ? previewAudioStreamIndex : null;
  const [languageProxy, setLanguageProxy] = React.useState<{ key: string; path: string } | null>(null);
  const [proxyErrorKey, setProxyErrorKey] = React.useState<string | null>(null);

  const [decodeErrorSource, setDecodeErrorSource] = React.useState<string | null>(null);
  const needsPreviewTranscode = configuredTranscode || (previewVideoSrc !== null && decodeErrorSource === previewVideoSrc);

  // match the grid's quality settings to reuse its cached range preview
  React.useEffect(() => {
    if (webpPreviewMode || !sceneRange || !sceneRangeKey) return;
    let cancelled = false;
    invoke<string>("ensure_scene_range_preview", {
      videoPath: sceneRange.videoPath,
      startSec: sceneRange.startSec,
      endSec: sceneRange.endSec,
      previewHeight: transcodePreset.height,
      previewCrf: transcodePreset.crf,
    })
      .then((path) => { if (!cancelled && path) setSceneRangeCut({ key: sceneRangeKey, path }); })
      .catch((err) => {
        console.warn("scene range preview failed", err);
        if (!cancelled) setSceneRangeErrorKey(sceneRangeKey);
      });
    return () => { cancelled = true; };
    // sceneRange is rebuilt every render; its key is what identifies it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneRangeKey, webpPreviewMode, transcodePreset]);

  const previewProxyKey = previewVideoSrc && !sceneRange
    ? `${previewVideoSrc}|${selectedMappedAudioStreamIndex ?? "default"}|${needsPreviewTranscode}|${transcodePreset.height}|${transcodePreset.crf}`
    : null;
  const languageProxySrc = languageProxy?.key === previewProxyKey ? languageProxy?.path ?? null : null;
  const previewFailed = sceneRangeFailed || (previewProxyKey !== null && proxyErrorKey === previewProxyKey);

  // build only the focused clip's proxy, keyed by source, audio and quality
  React.useEffect(() => {
    if (webpPreviewMode) return;
    if (sceneRange) return;
    if (!previewVideoSrc) return;
    if (selectedMappedAudioStreamIndex === null && !needsPreviewTranscode) return;
    let cancelled = false;
    invoke<string>("ensure_preview_proxy", {
      clipPath: previewVideoSrc,
      audioStreamIndex: selectedMappedAudioStreamIndex,
      transcodeVideo: needsPreviewTranscode,
      previewHeight: transcodePreset.height,
      previewCrf: transcodePreset.crf,
    })
      .then((path) => { if (!cancelled && path && previewProxyKey) setLanguageProxy({ key: previewProxyKey, path }); })
      .catch((err) => {
        console.warn("preview proxy failed", err);
        if (!cancelled) setProxyErrorKey(previewProxyKey);
      });
    return () => { cancelled = true; };
  }, [
    previewVideoSrc,
    selectedMappedAudioStreamIndex,
    webpPreviewMode,
    needsPreviewTranscode,
    transcodePreset,
    previewProxyKey,
  ]);

  // the raw clip renders black while a transcode is pending, so the player waits for the proxy
  const playableVideoSrc = sceneRange
    ? sceneRangeSrc
    : needsPreviewTranscode
      ? languageProxySrc
      : (languageProxySrc ?? previewVideoSrc);

  // source-anchored time window for the focused scene (mirrors the grid's WebP window)
  const sourcePath = sourceClipObj ? (sourceClipObj.originalPath || sourceClipObj.src) : null;
  const { start: sceneStart, end: sceneEnd } = clampWebpEnd(sourceClipObj?.startSec, sourceClipObj?.endSec);

  // generate the animated WebP for the focused clip on demand (never play the original video)
  React.useEffect(() => {
    if (!webpPreviewMode) return;
    if (!focusedClipId || !sourcePath || previewImageSrc) return;
    let cancelled = false;
    invoke<{ path?: string }>("generate_scene_webp", {
      sceneId: focusedClipId,
      sourcePath,
      start: sceneStart,
      end: sceneEnd,
      fps: webpFpsForRange(sceneStart, sceneEnd),
      episodeCacheId: openedEpisodeId ?? null,
      customPath: generalSettings.episodesPath ?? null,
      kind: "animated",
    })
      .then((res) => {
        if (cancelled || !res?.path) return;
        useScenePreviewStore.getState().setAnimated(focusedClipId, res.path);
      })
      .catch(() => {
        // best-effort; poster (if any) remains shown
      });
    return () => {
      cancelled = true;
    };
  }, [focusedClipId, sourcePath, previewImageSrc, sceneStart, sceneEnd, openedEpisodeId, generalSettings.episodesPath, webpPreviewMode]);

  React.useEffect(() => {
    if (showMergeNameModal) {
      requestAnimationFrame(() => {
        mergeNameInputRef.current?.focus();
        mergeNameInputRef.current?.select();
      });
    }
  }, [showMergeNameModal]);

  // one clip per source episode, capped: same episode means same tracks, and probing every clip spawns too many ffprobes
  const scenepackProbeKey = React.useMemo(() => {
    if (activePageForPreview !== "scenepacks") return "";
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const clip of clips) {
      if (!clip.clipPath) continue;
      const key = clip.episodeId ?? clip.clipPath;
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(clip.clipPath);
      if (paths.length >= 8) break;
    }
    return paths.join("|");
  }, [activePageForPreview, clips]);

  React.useEffect(() => {
    const sources = importedVideoPath
      ? [importedVideoPath]
      : activePageForPreview === "home" && openedEpisode?.videoPath
        ? [openedEpisode.videoPath]
        : scenepackProbeKey.split("|").filter(Boolean);
    if (sources.length === 0) {
      setAudioStreams([]);
      return;
    }

    let cancelled = false;

    Promise.all(
      sources.map((videoPath) =>
        invoke<PreviewAudioStream[]>("get_audio_streams", { videoPath }).catch(() => [])
      )
    )
      .then((results) => {
        if (cancelled) return;
        // union by language, since track order varies per file; export resolves the language per clip
        const byLanguage = new Map<string, PreviewAudioStream>();
        for (const streams of results) {
          for (const stream of streams ?? []) {
            const key = stream.language || `#${stream.audioStreamIndex}`;
            if (!byLanguage.has(key)) byLanguage.set(key, stream);
          }
        }
        setAudioStreams([...byLanguage.values()]);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("get_audio_streams failed", err);
        setAudioStreams([]);
      });

    return () => {
      cancelled = true;
    };
  }, [importedVideoPath, activePageForPreview, openedEpisode?.videoPath, scenepackProbeKey]);

  React.useEffect(() => {
    if (audioStreams.length === 0) {
      setPreviewAudioStreamIndex(null);
      return;
    }

    const current = audioStreams.find(
      (stream) => stream.audioStreamIndex === previewAudioStreamIndex
    );
    const chosen = current ?? audioStreams[0];
    setPreviewAudioStreamIndex(chosen.audioStreamIndex);
    setPreviewAudioLanguage(chosen.language || null);
  }, [
    audioStreams,
    previewAudioStreamIndex,
    setPreviewAudioStreamIndex,
    setPreviewAudioLanguage,
  ]);

  const onExportClick = () => {
    if (!hasSelectedClips) return;
    const targetClips = selectedClips;
    if (mergeClipsEnabled) {
      setShowMergeNameModal(true);
    } else {
      handleExport(targetClips, false);
    }
  };

  const confirmMergeExport = () => {
    const targetClips = selectedClips;
    const value = (mergeNameInputRef.current?.value ?? "").trim();
    if (!value) return;
    setShowMergeNameModal(false);
    handleExport(targetClips, true, value);
  };

  return (
    <main className="preview-container" >
      <div className="preview-windows-layout single">
        {hasSource && (
          <div className="preview-window-wrapper source" key="source-wrapper">
            <div className="preview-window">
              {webpPreviewMode && previewImageSrc ? (
                <img
                  className="preview-webp"
                  src={`${convertFileSrc(previewImageSrc)}?v=${importToken}`}
                  draggable={false}
                  onDragStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  alt=""
                />
              ) : !webpPreviewMode && playableVideoSrc && !previewFailed && props.active !== false ? (
                <VideoPlayer
                  key={`${playableVideoSrc}-${importToken}`}
                  src={convertFileSrc(playableVideoSrc)}
                  volume={generalSettings.playbackVolume}
                  clipId={sourceClipObj?.id}
                  startTime={sceneStartTime}
                  endTime={sceneEndTime}
                  onTimeUpdate={props.onTimeUpdate}
                  poster={previewPoster}
                  onError={() => {
                    if (sceneRangeKey) setSceneRangeErrorKey(sceneRangeKey);
                    else if (languageProxySrc) setProxyErrorKey(previewProxyKey);
                    else if (previewVideoSrc) setDecodeErrorSource(previewVideoSrc);
                  }}
                />
              ) : (
                <div className="preview-window empty">
                  {previewFailed ? (
                    <p>{t("preview.sceneLoadFailed")}</p>
                  ) : (
                    <>
                      {previewPoster && (
                        <img className="preview-loading-poster" src={previewPoster} alt="" draggable={false} />
                      )}
                      <LoadingSpinner label={t("preview.loading")} />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!hasSource && (
          <div className="preview-window empty" key="empty-preview">
            <p className="preview-empty-title">{t("preview.noClip")}</p>
          </div>
        )}
      </div>
      <div className="export-panel">
        <div className="export-header">
          <FaFileExport className="header-icon" />
          <span className="export-title">{t("export.title")}</span>
        </div>

        <div className="export-settings-row">
          <div className="export-setting-group export-profile-group">
            <label className="export-label">
            </label>
            <div className="export-dir-row">
              <Dropdown
                className="export-profile-select"
                options={exportProfileOptions}
                value={activeExportProfile.id}
                onChange={setActiveExportProfileId}
                preferredDirection="down"
                showTriggerDescription={false}
              />
              <Tooltip content={t("export.editSettings")}>
                <button
                  className="buttons export-dir-browse"
                  onClick={() => openSettings("export")}
                  aria-label={t("export.editSettings")}
                >
                  <FaPencilAlt />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="export-path-section">
          <label className="export-label">
          </label>
          <div className="export-dir-row">
            <input
              type="text"
              className="export-dir-input"
              placeholder={t("export.destinationPlaceholder")}
              value={exportDir || ""}
              onChange={(e) => setExportDir(e.target.value)}
            />
            <Tooltip content={t("export.browseFolder")}>
              <button
                className="buttons export-dir-browse"
                onClick={handlePickExportDir}
                aria-label={t("export.browseFolder")}
              >
                <FaFolderOpen />
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="export-options-row">
          <div className="export-dir-row">
            <div className="export-dir-item export-merge-option">
              <span className="merge-clips-label" aria-hidden="true">
                {t("export.mergeClips")}
              </span>
              <button
                type="button"
                className="export-merge-switch"
                role="switch"
                aria-label={t("export.mergeClips")}
                aria-checked={mergeClipsEnabled}
                onClick={() => setMergeClipsEnabled(!mergeClipsEnabled)}
              />
            </div>
            {davinciAvailable && (
              <div className="export-dir-item">
                <Tooltip
                  content={
                    davinciExportSelected
                      ? t("export.davinciOn")
                      : t("export.davinciOff")
                  }
                >
                  <button
                    type="button"
                    className={`davinci-export-toggle${davinciExportSelected ? " is-active" : ""}`}
                    aria-pressed={davinciExportSelected}
                    aria-label={t("export.davinciAria")}
                    onClick={() => setDavinciExportSelected(!davinciExportSelected)}
                  >
                    <SiDavinciresolve />
                  </button>
                </Tooltip>
              </div>
            )}
            <div className="export-dir-item export-post-passes-option">
              <Tooltip content={t("export.configurePostPasses")}>
                <button className="post-passes-label" type="button" onClick={() => openSettings("export")}>
                  {t("export.postPasses")}
                </button>
              </Tooltip>
              <button
                type="button"
                className="export-merge-switch"
                role="switch"
                aria-label={t("export.postPassesToggle")}
                aria-checked={postExportPassesEnabled}
                onClick={() => {
                  const enabled = !postExportPassesEnabled;
                  setPostExportPassesEnabled(enabled);
                  if (enabled && !anyPassEnabled(generalSettings.postExportPasses)) openSettings("export");
                }}
              />
            </div>
            <div className="export-dir-item export-language-option">
              <div className="audio-stream-field" aria-label={t("export.previewLanguageAria")}>
                <span className="audio-stream-label" aria-hidden="true">
                  {t("export.previewLanguage")}
                </span>

                <Dropdown
                  className="audio-stream-select"
                  options={audioStreamOptions}
                  value={previewAudioStreamIndex ?? (audioStreams[0]?.audioStreamIndex ?? 0)}
                  onChange={(index) => {
                    setPreviewAudioStreamIndex(index);
                    setPreviewAudioLanguage(
                      audioStreams.find((s) => s.audioStreamIndex === index)?.language || null
                    );
                  }}
                  preferredDirection="up"
                  // the closed picker shows the language; the title stays in the open list
                  showTriggerDescription={false}
                  disabled={audioStreamOptions.length === 0}
                />
              </div>
            </div>
          </div>
        </div>

        {/* wrapper span: with no selection the button is disabled and fires no
            pointer events, which is exactly when its hint matters most */}
        <Tooltip
          content={!hasSelectedClips ? t("export.selectAtLeastOne") : t("export.exportSelected")}
        >
          <span className="tooltip-anchor export-main-anchor">
            <button
              className="buttons export-main-button"
              disabled={!hasSelectedClips}
              onClick={onExportClick}
            >
              {t("export.exportNow")}
            </button>
          </span>
        </Tooltip>
      </div>

      <HowToUse />

      {showMergeNameModal && (
        <div
          className="episode-modal-overlay"
          onMouseDown={() => setShowMergeNameModal(false)}
        >
          <div
            className="episode-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="episode-modal-title">{t("mergeModal.title")}</div>
            <input
              ref={mergeNameInputRef}
              className="episode-modal-input"
              placeholder={t("mergeModal.placeholder")}
              defaultValue={defaultMergedName}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmMergeExport();
              }}
            />
            <div className="episode-modal-actions">
              <button
                type="button"
                className="episode-modal-btn"
                onClick={() => setShowMergeNameModal(false)}
              >
                {t("common:cancel")}
              </button>
              <button
                type="button"
                className="episode-modal-btn primary"
                onClick={confirmMergeExport}
              >
                {t("mergeModal.export")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
