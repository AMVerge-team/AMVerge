/** custom-skinned preview player, rendering the markup the preview css targets */
import { useCallback, useEffect, useRef, useState } from "react";
import { FaPlay, FaPause, FaVolumeUp, FaVolumeDown, FaVolumeMute, FaExpand } from "react-icons/fa";

import Tooltip from "../common/Tooltip";

import { useGeneralSettingsStore } from "../../stores/settingsStore.ts";

const VOLUME_HIDE_DELAY_MS = 700;
const VOLUME_COMMIT_DELAY_MS = 150;
/** unmuting always comes back this quiet, never at a level that blasts; drag up from there */
const UNMUTE_VOLUME = 0.01;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type VideoPlayerProps = {
  src: string;
  volume: number;
  clipId?: string;
  startTime?: number;
  endTime?: number;
  onTimeUpdate?: (time: number) => void;
  /** always muted, with no volume control (scene scout flow's input clip) */
  silent?: boolean;
};

export default function VideoPlayer({
  src,
  volume,
  clipId,
  startTime,
  endTime,
  onTimeUpdate,
  silent = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);

  // writes straight to the setting the panel reads, so it is the same value as Settings > Playback Volume
  const setPlaybackVolume = useGeneralSettingsStore((s) => s.setPlaybackVolume);
  // in the store because PreviewContainer remounts this per clip
  const muted = useGeneralSettingsStore((s) => s.playbackMuted);
  const setMuted = useGeneralSettingsStore((s) => s.setPlaybackMuted);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumeOpen, setVolumeOpen] = useState(false);
  // the level mid-drag, held locally; null follows the prop
  const [dragVolume, setDragVolume] = useState<number | null>(null);

  const hideTimerRef = useRef<number | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const displayVolume = dragVolume ?? volume;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (silent) {
      v.muted = true;
      return;
    }
    // a drag owns the element until it commits; the store's pre-drag level would jump it
    if (dragVolume !== null) return;
    v.volume = volume;
    v.muted = muted || volume === 0;
  }, [volume, muted, src, dragVolume, silent]);

  // the store is persisted, so skip unchanged writes
  const syncMuted = useCallback((next: boolean) => {
    if (next !== useGeneralSettingsStore.getState().playbackMuted) setMuted(next);
  }, [setMuted]);

  const commitVolume = useCallback((value: number) => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setPlaybackVolume(value);
    setDragVolume(null);
  }, [setPlaybackVolume]);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      // a drag that left the slider still owns the pointer
      if (draggingRef.current) return;
      setVolumeOpen(false);
    }, VOLUME_HIDE_DELAY_MS);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  useEffect(() => () => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
  }, []);

  // a drag released outside the slider still ends it and restarts the dismiss countdown
  useEffect(() => {
    const onPointerUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      // releasing settles the value, so stop deferring and write it through
      if (dragVolume !== null) commitVolume(dragVolume);
      const wrap = volumeRef.current;
      if (!wrap?.matches(":hover")) scheduleHide();
    };
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, [scheduleHide, commitVolume, dragVolume]);

  //
  // releases the player on unmount like grid tiles (a detached video keeps playing audio); setup restores src for StrictMode
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    if (src && v.getAttribute("src") !== src) {
      v.setAttribute("src", src);
      try {
        v.load();
        v.play().catch(() => {});
      } catch {
      }
    }

    return () => {
      try {
        v.pause();
        v.removeAttribute("src");
        v.load();
      } catch {
      }
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  // audio and slider update from local state; the persisted store only hears once the drag settles
  const applyVolume = useCallback((next: number, commit = false) => {
    const clamped = Math.min(1, Math.max(0, next));
    const v = videoRef.current;
    if (v) {
      v.volume = clamped;
      // dragging to the bottom is a mute, and dragging back up undoes it
      v.muted = clamped === 0;
    }
    syncMuted(clamped === 0);

    if (commit) {
      commitVolume(clamped);
      return;
    }

    setDragVolume(clamped);
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      commitVolume(clamped);
    }, VOLUME_COMMIT_DELAY_MS);
  }, [commitVolume, syncMuted]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.muted || displayVolume === 0) {
      // a single click, not a drag - no reason to defer it
      applyVolume(UNMUTE_VOLUME, true);
    } else {
      v.muted = true;
      syncMuted(true);
    }
  }, [applyVolume, displayVolume, syncMuted]);

  const showVolume = useCallback(() => {
    cancelHide();
    setVolumeOpen(true);
  }, [cancelHide]);

  const toggleFullscreen = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  const hasSceneRange =
    startTime !== undefined &&
    endTime !== undefined &&
    isFinite(startTime) &&
    isFinite(endTime) &&
    endTime > startTime;

  const sceneDuration = hasSceneRange ? endTime - startTime : duration;
  const relativeCurrent = hasSceneRange
    ? Math.max(0, Math.min(sceneDuration, current - (startTime ?? 0)))
    : current;

  // jump to the scene start once per clip; canplay also fires after every user seek
  const initialSeekPendingRef = useRef(true);
  useEffect(() => {
    initialSeekPendingRef.current = true;
  }, [clipId, src, startTime]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const target = startTime !== undefined && isFinite(startTime) ? startTime : 0;
    if (v.readyState >= 1) {
      try {
        v.currentTime = target;
        setCurrent(target);
        v.play().catch(() => {});
        setPlaying(true);
      } catch {}
    }
  }, [clipId, startTime]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    initialSeekPendingRef.current = false;
    if (hasSceneRange) {
      const target = (startTime ?? 0) + fraction * sceneDuration;
      v.currentTime = target;
      setCurrent(target);
    } else if (isFinite(duration) && duration > 0) {
      const target = fraction * duration;
      v.currentTime = target;
      setCurrent(target);
    }
  }, [hasSceneRange, startTime, sceneDuration, duration]);

  return (
    <div className="video-wrapper">
      <div className="video-frame" ref={frameRef}>
        <video
          ref={videoRef}
          src={src}
          autoPlay
          playsInline
          muted={silent}
          onClick={togglePlay}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            v.volume = volume;
            v.muted = silent || muted || volume === 0;
            setDuration(v.duration);
            if (startTime !== undefined && isFinite(startTime) && startTime > 0) {
              try {
                v.currentTime = startTime;
                setCurrent(startTime);
              } catch {}
            }
          }}
          onCanPlay={(e) => {
            if (!initialSeekPendingRef.current) return;
            initialSeekPendingRef.current = false;
            if (startTime !== undefined && isFinite(startTime) && startTime > 0) {
              const v = e.currentTarget;
              if (Math.abs(v.currentTime - startTime) > 0.5) {
                try {
                  v.currentTime = startTime;
                  setCurrent(startTime);
                } catch {}
              }
            }
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onVolumeChange={(e) => {
            // a silent player's own mute is not the user's setting
            if (!silent) syncMuted(e.currentTarget.muted);
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            const t = v.currentTime;
            if (hasSceneRange && t >= endTime!) {
              const loopTarget = startTime ?? 0;
              v.currentTime = loopTarget;
              setCurrent(loopTarget);
              onTimeUpdate?.(loopTarget);
              return;
            }
            setCurrent(t);
            onTimeUpdate?.(t);
          }}
          onEnded={(e) => {
            const loopTarget = startTime !== undefined && isFinite(startTime) ? startTime : 0;
            const v = e.currentTarget;
            try {
              v.currentTime = loopTarget;
              setCurrent(loopTarget);
              v.play().catch(() => {});
            } catch {}
          }}
        />
        <div className="controls">
          <Tooltip content={playing ? "Pause" : "Play"}>
            <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <FaPause /> : <FaPlay />}
            </button>
          </Tooltip>

          <span className="time-display">
            {formatTime(relativeCurrent)} / {formatTime(sceneDuration)}
          </span>

          <div className="progress" onClick={handleSeek}>
            <progress
              value={relativeCurrent}
              max={sceneDuration > 0 ? sceneDuration : 1}
            />
          </div>

          {!silent && (
          <div
            className={`volume-control${volumeOpen ? " open" : ""}`}
            ref={volumeRef}
            onMouseEnter={showVolume}
            onMouseLeave={scheduleHide}
          >
            <Tooltip content={muted ? "Unmute" : "Mute"}>
            <button
              onClick={toggleMute}
              onFocus={showVolume}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || displayVolume === 0
                ? <FaVolumeMute />
                : displayVolume < 0.5 ? <FaVolumeDown /> : <FaVolumeUp />}
            </button>
            </Tooltip>

            <div className="volume-popup" aria-hidden={!volumeOpen}>
              <input
                className="volume-slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : displayVolume}
                aria-label="Volume"
                tabIndex={volumeOpen ? 0 : -1}
                style={{ "--volume-fill": `${(muted ? 0 : displayVolume) * 100}%` } as React.CSSProperties}
                onPointerDown={() => { draggingRef.current = true; cancelHide(); }}
                onChange={(e) => applyVolume(parseFloat(e.target.value))}
              />
            </div>
          </div>
          )}

          <Tooltip content="Fullscreen" align="end">
            <button onClick={toggleFullscreen} aria-label="Fullscreen">
              <FaExpand />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
