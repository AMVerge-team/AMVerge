/**
 * VideoPlayer.tsx
 *
 * custom-skinned preview player. renders the markup the existing preview CSS
 * targets (.video-wrapper > .video-frame > video + .controls) so the default
 * browser controls are replaced by the app's play/pause, scrubber, time,
 * volume and fullscreen chrome.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FaPlay, FaPause, FaVolumeUp, FaVolumeDown, FaVolumeMute, FaExpand } from "react-icons/fa";

import Tooltip from "../common/Tooltip";

import { useGeneralSettingsStore } from "../../stores/settingsStore.ts";

const VOLUME_HIDE_DELAY_MS = 700;
const FALLBACK_VOLUME = 0.5;
const VOLUME_COMMIT_DELAY_MS = 150;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type VideoPlayerProps = {
  src: string;
  volume: number;
  onTimeUpdate?: (time: number) => void;
};

export default function VideoPlayer({ src, volume, onTimeUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);

  // the slider writes straight back to the setting the preview panel reads, so
  // the control and Settings > Playback Volume are the same value
  const setPlaybackVolume = useGeneralSettingsStore((s) => s.setPlaybackVolume);
  // mute lives in the store for the same reason volume does: PreviewContainer
  // keys this component on the clip, so local state would reset on every switch
  const muted = useGeneralSettingsStore((s) => s.playbackMuted);
  const setMuted = useGeneralSettingsStore((s) => s.setPlaybackMuted);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumeOpen, setVolumeOpen] = useState(false);
  // level being dragged right now, held locally so a drag never waits on the
  // settings store. null means "no drag in flight, follow the prop"
  const [dragVolume, setDragVolume] = useState<number | null>(null);

  const hideTimerRef = useRef<number | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  // last audible level, so unmuting a slider dragged to zero has somewhere to go
  const lastVolumeRef = useRef(volume > 0 ? volume : FALLBACK_VOLUME);

  const displayVolume = dragVolume ?? volume;

  useEffect(() => {
    if (volume > 0) lastVolumeRef.current = volume;
    const v = videoRef.current;
    if (!v) return;
    // a drag owns the element until it commits, and the store still holds the
    // pre-drag level; applying it here would jump the volume mid-gesture
    if (dragVolume !== null) return;
    v.volume = volume;
    v.muted = muted || volume === 0;
  }, [volume, muted, src, dragVolume]);

  // the store is persisted, so an unchanged write still costs a serialize and a
  // re-render of everything subscribed to it
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
      // a drag that wandered off the slider still owns the pointer; closing
      // under it would drop the grab mid-gesture
      if (draggingRef.current) return;
      setVolumeOpen(false);
    }, VOLUME_HIDE_DELAY_MS);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  useEffect(() => () => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
  }, []);

  // a drag released outside the slider still ends the drag, and restarts the
  // dismiss countdown if the pointer never came back
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

  // Media player release, same pattern as the grid tiles (see LazyClip). a
  // detached <video> keeps decoding and keeps playing audio until GC, and
  // PreviewContainer remounts this component on every src change, so without
  // this, stepping through clips piles one audio track on top of the next.
  //
  // the element is captured during setup because React nulls the ref before
  // passive cleanups run on unmount; releasing the captured (detached) element
  // still frees its player. the setup phase also restores a src that a previous
  // cleanup stripped: StrictMode re-runs cleanup+setup on the SAME element, and
  // React won't re-apply a src prop it considers unchanged
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

  // the store is persisted, so every write serializes the whole settings blob to
  // localStorage synchronously - and PreviewContainer subscribes to the store
  // unsliced, so every write re-renders the preview tree. a range drag fires
  // dozens of events a second, which is more than enough of both to stutter.
  // so: audio and the slider position update immediately off local state, and
  // the store only hears about it once the drag settles
  const applyVolume = useCallback((next: number, commit = false) => {
    const clamped = Math.min(1, Math.max(0, next));
    const v = videoRef.current;
    if (v) {
      v.volume = clamped;
      // dragging to the bottom is a mute, and dragging back up undoes it
      v.muted = clamped === 0;
    }
    if (clamped > 0) lastVolumeRef.current = clamped;
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
      applyVolume(displayVolume > 0 ? displayVolume : lastVolumeRef.current || FALLBACK_VOLUME, true);
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

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !isFinite(duration) || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    v.currentTime = fraction * duration;
  }, [duration]);

  return (
    <div className="video-wrapper">
      <div className="video-frame" ref={frameRef}>
        <video
          ref={videoRef}
          src={src}
          autoPlay
          playsInline
          onClick={togglePlay}
          onLoadedMetadata={(e) => {
            e.currentTarget.volume = volume;
            // each clip mounts a fresh element, so carry the mute across rather
            // than letting the next clip come back at full volume
            e.currentTarget.muted = muted || volume === 0;
            setDuration(e.currentTarget.duration);
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onVolumeChange={(e) => syncMuted(e.currentTarget.muted)}
          onTimeUpdate={(e) => {
            setCurrent(e.currentTarget.currentTime);
            onTimeUpdate?.(e.currentTarget.currentTime);
          }}
        />
        <div className="controls">
          <Tooltip content={playing ? "Pause" : "Play"}>
            <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <FaPause /> : <FaPlay />}
            </button>
          </Tooltip>

          <span className="time-display">
            {formatTime(current)} / {formatTime(duration)}
          </span>

          <div className="progress" onClick={handleSeek}>
            <progress value={current} max={duration > 0 ? duration : 1} />
          </div>

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
