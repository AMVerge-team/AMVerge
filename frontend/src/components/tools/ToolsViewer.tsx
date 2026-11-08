import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FaExpand, FaPause, FaPlay } from "react-icons/fa";

import Tooltip from "../common/Tooltip";
import LoadingSpinner from "../common/LoadingSpinner";
import { useToolsStore, type ToolKind } from "../../stores/toolsStore";
import { useToolsPlayable } from "../../features/tools/useToolsPlayable";
import { UPSCALE_MODEL_OPTIONS } from "../../features/export/postPasses";

type Size = { width: number; height: number };

const formatSize = (size: Size | null) => (size ? `${size.width} × ${size.height}` : "");

const RESULT_LABEL: Record<ToolKind, string> = { upscale: "Upscaled", depth: "Depth map" };
const RENDER_VERB: Record<ToolKind, string> = { upscale: "upscaled", depth: "depth map" };
// past this the right video jumps back onto the left; below it, its speed is nudged so it glides back without a stutter
const JUMP_SEC = 0.25;
// close enough to leave alone
const SYNCED_SEC = 0.015;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * two players side by side, kept in sync: the original on the left, on the right the frames as they render and
 * then the finished result. the left video leads; either player's controls drive both
 */
export default function ToolsViewer() {
  const source = useToolsStore((s) => s.source);
  const kind = useToolsStore((s) => s.kind);
  const status = useToolsStore((s) => s.status);
  const message = useToolsStore((s) => s.message);
  const compare = useToolsStore((s) => s.compare);
  const liveFrame = useToolsStore((s) => s.liveFrame);
  const liveAt = useToolsStore((s) => s.liveAt);
  const upscaleModel = useToolsStore((s) => s.upscale.model);

  const rendering = status === "preparing" || status === "running";
  const comparing = !rendering && compare !== null;
  const range =
    source && source.startMs !== undefined && source.endMs !== undefined
      ? { startSec: source.startMs / 1000, endSec: source.endMs / 1000 }
      : null;

  const original = useToolsPlayable(comparing ? compare!.original : source?.path ?? null, comparing ? null : range);
  const processed = useToolsPlayable(comparing ? compare!.processed : null);

  const leadRef = useRef<HTMLVideoElement | null>(null);
  const followRef = useRef<HTMLVideoElement | null>(null);
  const leftFrameRef = useRef<HTMLDivElement | null>(null);
  const rightFrameRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  // the source's real size (what plays may be a smaller copy); the result is it times the model's scale
  const [inputSize, setInputSize] = useState<Size | null>(null);
  const sourcePath = source?.path ?? null;
  useEffect(() => {
    setInputSize(null);
    if (!sourcePath) return;
    let alive = true;
    invoke<Size>("tools_video_size", { path: sourcePath })
      .then((size) => {
        if (alive) setInputSize(size);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sourcePath]);
  const scale = UPSCALE_MODEL_OPTIONS.find((option) => option.value === upscaleModel)?.scale ?? 2;
  const outputSize =
    inputSize && kind === "upscale" ? { width: inputSize.width * scale, height: inputSize.height * scale } : inputSize;

  // the live frame on screen; the newest one waits unseen until it has decoded
  const [shownLive, setShownLive] = useState<string | null>(null);
  useEffect(() => {
    if (!rendering) setShownLive(null);
  }, [rendering]);

  // set while the timeline is held: the drag owns both videos' positions, nothing else moves them
  const scrubbingRef = useRef(false);

  /** puts the right video where the left one is and matches play/pause; skipped mid-drag */
  const follow = useCallback(() => {
    const lead = leadRef.current;
    const follower = followRef.current;
    if (!lead || !follower || follower.readyState < 1 || scrubbingRef.current) return;
    follower.playbackRate = 1;
    follower.currentTime = Math.min(lead.currentTime, follower.duration || lead.currentTime);
    if (lead.paused !== follower.paused) {
      if (lead.paused) follower.pause();
      else follower.play().catch(() => {});
    }
  }, []);

  // while both play, every frame: a small drift is evened out by speeding up or slowing down the right video a
  // touch, a big one (a stall, a dropped decode) by a jump; timeupdate alone fires too rarely to hold them together
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const lead = leadRef.current;
      const follower = followRef.current;
      if (lead && follower && follower.readyState >= 2 && !scrubbingRef.current && !lead.seeking && !follower.seeking) {
        const drift = follower.currentTime - lead.currentTime;
        if (Math.abs(drift) > JUMP_SEC) {
          follower.playbackRate = 1;
          follower.currentTime = Math.min(lead.currentTime, follower.duration || lead.currentTime);
        } else if (Math.abs(drift) > SYNCED_SEC) {
          follower.playbackRate = Math.min(1.1, Math.max(0.9, 1 - drift * 2));
        } else if (follower.playbackRate !== 1) {
          follower.playbackRate = 1;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  // while it renders, the original holds still on the frame the right side is showing (also once it loads late)
  useEffect(() => {
    const lead = leadRef.current;
    if (!rendering || !lead) return;
    lead.pause();
    if (liveAt !== null && isFinite(lead.duration) && lead.duration > 0) {
      lead.currentTime = liveAt * lead.duration;
      setCurrent(lead.currentTime);
    }
  }, [rendering, liveAt, duration]);

  const togglePlay = useCallback(() => {
    const lead = leadRef.current;
    if (!lead || rendering) return;
    if (lead.paused) lead.play().catch(() => {});
    else lead.pause();
  }, [rendering]);

  /** both videos to the same time at once, so neither waits on the other to arrive */
  const seekBoth = useCallback((time: number) => {
    const lead = leadRef.current;
    const follower = followRef.current;
    if (!lead) return;
    lead.currentTime = time;
    if (follower && follower.readyState >= 1) {
      follower.playbackRate = 1;
      follower.currentTime = Math.min(time, follower.duration || time);
    }
    setCurrent(time);
  }, []);

  // holding the timeline scrubs: both pause, follow the pointer (at most once a frame), and play on together on release
  const resumeAfterScrubRef = useRef(false);
  const scrubTargetRef = useRef<number | null>(null);
  const scrubFrameRef = useRef(0);
  const timeAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const lead = leadRef.current;
    if (!lead || !isFinite(lead.duration) || lead.duration <= 0) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * lead.duration;
  };
  const scrubTo = (time: number) => {
    scrubTargetRef.current = time;
    setCurrent(time);
    if (scrubFrameRef.current) return;
    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = 0;
      if (scrubTargetRef.current !== null) seekBoth(scrubTargetRef.current);
    });
  };
  const startScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const lead = leadRef.current;
    const time = timeAt(e);
    if (!lead || rendering || time === null || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbingRef.current = true;
    resumeAfterScrubRef.current = !lead.paused;
    lead.pause();
    followRef.current?.pause();
    scrubTo(time);
  };
  const moveScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    const time = timeAt(e);
    if (time !== null) scrubTo(time);
  };
  const endScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    cancelAnimationFrame(scrubFrameRef.current);
    scrubFrameRef.current = 0;
    const time = timeAt(e) ?? scrubTargetRef.current;
    scrubTargetRef.current = null;
    if (time !== null) seekBoth(time);
    scrubbingRef.current = false;
    if (!resumeAfterScrubRef.current) return;
    // play once both have landed, so they start from the same frame
    const landed = (v: HTMLVideoElement | null) =>
      new Promise<void>((resolve) => {
        if (!v || !v.seeking) return resolve();
        v.addEventListener("seeked", () => resolve(), { once: true });
      });
    void Promise.all([landed(leadRef.current), landed(followRef.current)]).then(() => {
      leadRef.current?.play().catch(() => {});
    });
  };

  const fullscreen = useCallback((frame: HTMLDivElement | null) => {
    if (!frame) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else frame.requestFullscreen().catch(() => {});
  }, []);

  if (!source) return null;

  // the preview pane's control bar; on both players, both driving the pair
  const controls = (frame: React.RefObject<HTMLDivElement | null>) =>
    rendering ? null : (
      <div className="controls">
        <Tooltip content={playing ? "Pause" : "Play"}>
          <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <FaPause /> : <FaPlay />}
          </button>
        </Tooltip>
        <span className="time-display">
          {formatTime(current)} / {formatTime(duration)}
        </span>
        <div
          className="progress tools-scrub"
          onPointerDown={startScrub}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
        >
          <progress value={current} max={duration > 0 ? duration : 1} />
        </div>
        <Tooltip content="Fullscreen" align="end">
          <button onClick={() => fullscreen(frame.current)} aria-label="Fullscreen">
            <FaExpand />
          </button>
        </Tooltip>
      </div>
    );

  const player = (
    frame: React.RefObject<HTMLDivElement | null>,
    label: ReactNode,
    content: ReactNode,
    withControls: boolean,
    size: Size | null,
  ) => (
    <div className="tools-player">
      <div className="tools-player-box">
        <div className="video-wrapper">
          <div className="video-frame tools-player-frame" ref={frame}>
            {content}
            <span className="tools-pane-label">{label}</span>
            {withControls && controls(frame)}
          </div>
        </div>
      </div>
      <span className="tools-dims">{formatSize(size)}</span>
    </div>
  );

  const left = original.src ? (
    <video
      ref={leadRef}
      key={original.src}
      src={original.src}
      autoPlay={!rendering}
      muted
      playsInline
      onClick={togglePlay}
      onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      onPlay={() => {
        setPlaying(true);
        follow();
      }}
      onPause={() => {
        setPlaying(false);
        follow();
      }}
      onSeeked={() => follow()}
      onTimeUpdate={(e) => {
        if (!scrubbingRef.current) setCurrent(e.currentTarget.currentTime);
      }}
      onEnded={() => {
        // both back to the start together, then on again
        seekBoth(0);
        leadRef.current?.play().catch(() => {});
      }}
    />
  ) : (
    <div className="tools-pane-empty">
      {original.failed ? "Could not prepare a preview of this clip." : <LoadingSpinner label="Preparing preview" />}
    </div>
  );

  let right: ReactNode;
  let rightHasVideo = false;
  if (comparing && processed.src) {
    rightHasVideo = true;
    right = (
      <video
        ref={followRef}
        key={processed.src}
        src={processed.src}
        muted
        playsInline
        onClick={togglePlay}
        onLoadedMetadata={() => follow()}
      />
    );
  } else if (comparing && processed.failed) {
    right = <div className="tools-pane-empty">Could not show the result.</div>;
  } else if (rendering && (liveFrame || shownLive)) {
    // each live frame is a one-frame video encoded like the export, shown by the same player as the result;
    // the next loads unseen and swaps in once decoded, so nothing flashes between frames
    const frames = [shownLive, liveFrame].filter((url, i, all): url is string => !!url && all.indexOf(url) === i);
    right = (
      <>
        {frames.map((url) => (
          <video
            key={url}
            className={`tools-live-video${url === shownLive ? "" : " is-incoming"}`}
            src={url}
            muted
            playsInline
            preload="auto"
            onLoadedData={() => setShownLive(url)}
          />
        ))}
      </>
    );
  } else if (rendering || comparing) {
    right = (
      <div className="tools-pane-empty">
        <LoadingSpinner label={status === "running" ? "Waiting for the first frame" : message || "Preparing..."} />
      </div>
    );
  } else {
    right = (
      <div className="tools-pane-empty tools-pane-waiting">
        <span className="tools-waiting-title">The {RENDER_VERB[kind]} version will preview here</span>
      </div>
    );
  }

  // both players take the clip's shape (4:3, ultrawide...), 16:9 until its size is known; the result keeps it
  const aspect = inputSize && inputSize.width > 0 && inputSize.height > 0 ? inputSize.width / inputSize.height : 16 / 9;
  const pairStyle = { "--tools-aspect": aspect } as React.CSSProperties;

  return (
    <div className="tools-pair" style={pairStyle}>
      {player(leftFrameRef, "Original", left, true, inputSize)}
      {player(rightFrameRef, RESULT_LABEL[kind], right, rightHasVideo, outputSize)}
    </div>
  );
}
