import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaCheck, FaDatabase, FaPlay, FaPlus, FaSearch, FaVideo } from "../icons/animated";

import { useUIStateStore } from "../../stores/UIStore";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

const R2_TUTORIAL_BASE = "https://amverge.tsukyio.com/tutorial";

type SampleClip = {
  id: string;
  title: string;
  prompt: string;
  keywords: string[];
  videoUrl: string;
  score: string;
};

const SAMPLE_CLIPS: SampleClip[] = [
  {
    id: "sword-fight",
    title: "Episode 04 · Scene 18",
    prompt: "sword fight",
    keywords: ["sword", "fight", "blade", "action", "battle", "attack"],
    videoUrl: `${R2_TUTORIAL_BASE}/sword-fight.mp4`,
    score: "96% match",
  },
  {
    id: "crying-rain",
    title: "Episode 07 · Scene 42",
    prompt: "crying in the rain",
    keywords: ["crying", "rain", "sad", "tears", "water"],
    videoUrl: `${R2_TUTORIAL_BASE}/crying-rain.mp4`,
    score: "94% match",
  },
  {
    id: "close-up-eyes",
    title: "Episode 02 · Scene 09",
    prompt: "close up eyes",
    keywords: ["close", "eyes", "eye", "face", "stare", "look"],
    videoUrl: `${R2_TUTORIAL_BASE}/close-up-eyes.mp4`,
    score: "92% match",
  },
  {
    id: "sunset-sky",
    title: "Episode 11 · Scene 64",
    prompt: "sunset sky",
    keywords: ["sunset", "sky", "clouds", "orange", "horizon", "sun"],
    videoUrl: `${R2_TUTORIAL_BASE}/sunset-sky.mp4`,
    score: "91% match",
  },
];

type Box = { top: number; left: number; width: number; height: number };

const PAD = 6;
const GAP = 14;
const MARGIN = 12;

function findTarget(targets: string[]): Box | null {
  for (const target of targets) {
    const el = document.querySelector(`[data-scout-tour="${target}"]`);
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) {
      return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
    }
  }
  return null;
}

function placeCard(box: Box | null, w: number, h: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!box) return { left: (vw - w) / 2, top: (vh - h) / 2 };
  const clampTop = (t: number) => Math.min(Math.max(t, MARGIN), vh - h - MARGIN);
  const clampLeft = (l: number) => Math.min(Math.max(l, MARGIN), vw - w - MARGIN);
  if (box.left + box.width + GAP + w <= vw - MARGIN) return { left: box.left + box.width + GAP, top: clampTop(box.top) };
  if (box.left - GAP - w >= MARGIN) return { left: box.left - GAP - w, top: clampTop(box.top) };
  if (box.top + box.height + GAP + h <= vh - MARGIN) return { left: clampLeft(box.left), top: box.top + box.height + GAP };
  return { left: clampLeft(box.left), top: clampTop(box.top - GAP - h) };
}

function matchSampleClip(query: string): SampleClip {
  const q = query.trim().toLowerCase();
  const exact = SAMPLE_CLIPS.find((c) => c.prompt === q);
  if (exact) return exact;
  const byKeyword = SAMPLE_CLIPS.find((c) => c.keywords.some((k) => q.includes(k)));
  return byKeyword ?? SAMPLE_CLIPS[0];
}

/** Interactive game-style walkthrough of Scene Scout with instant hands-on sample steps. */
export function SceneScoutTour() {
  const setSeen = useUIStateStore((s) => s.setSceneScoutTourSeen);
  const setSidebarEnabled = useUIStateStore((s) => s.setSidebarEnabled);
  const databases = useSceneScoutStore((s) => s.databases);

  const [index, setIndex] = useState(0);
  const [demoCollectionCreated, setDemoCollectionCreated] = useState(false);
  const [demoClipsLoaded, setDemoClipsLoaded] = useState(false);
  const [demoQuery, setDemoQuery] = useState("");
  const [matchedClip, setMatchedClip] = useState<SampleClip | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);

  const [box, setBox] = useState<Box | null>(null);
  const [cardSize, setCardSize] = useState({ w: 380, h: 240 });
  const cardRef = useRef<HTMLDivElement>(null);

  const totalSteps = 4;
  const last = index >= totalSteps - 1;

  // Step completion checks (either via the interactive demo button or real app state)
  const step1Done = demoCollectionCreated || databases.length > 0;
  const step2Done = demoClipsLoaded || databases.some((d) => d.sceneCount > 0);
  const step3Done = matchedClip !== null;

  const canAdvance =
    index === 0 ? step1Done : index === 1 ? step2Done : index === 2 ? step3Done : true;

  const finish = () => setSeen(true);
  const next = () => {
    if (last) finish();
    else setIndex((i) => i + 1);
  };
  const back = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    setSidebarEnabled(true);
  }, [setSidebarEnabled]);

  const stepTargets =
    index === 0
      ? ["hero-dbs", "db-actions", "db-empty"]
      : index === 1
        ? ["add-episode", "hero-dbs"]
        : index === 2
          ? ["search-field", "hero-dbs"]
          : ["mode-tabs"];

  useEffect(() => {
    let frame = 0;
    let prev = "";
    const tick = () => {
      const found = findTarget(stepTargets);
      const key = JSON.stringify(found);
      if (key !== prev) {
        prev = key;
        setBox(found);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [index]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCardSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [index, demoCollectionCreated, demoClipsLoaded, matchedClip, videoFailed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const runDemoSearch = (prompt: string) => {
    setDemoQuery(prompt);
    setVideoFailed(false);
    setMatchedClip(matchSampleClip(prompt));
  };

  const pos = placeCard(box, cardSize.w, cardSize.h);

  return createPortal(
    <div className="scout-tour" role="dialog" aria-modal="true" aria-label="Scene Scout interactive tutorial">
      {box ? (
        <div className="scout-tour-highlight" style={box} />
      ) : (
        <div className="scout-tour-dim" />
      )}

      <div ref={cardRef} className="scout-tour-card" style={{ ...pos, maxWidth: 400 }}>
        {index === 0 && (
          <>
            <h3 className="scout-tour-title">Quest 1: Create a Collection</h3>
            <p className="scout-tour-body">
              A <b>collection</b> holds the searchable scenes for an anime series or clip pack. Try creating a sample
              collection below to unlock the next step:
            </p>
            <div style={{ margin: "10px 0 4px" }}>
              {!step1Done ? (
                <button
                  type="button"
                  className="scout-tour-btn is-primary"
                  style={{ width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 6, padding: "8px 12px" }}
                  onClick={() => {
                    setDemoCollectionCreated(true);
                    setTimeout(() => setIndex(1), 350);
                  }}
                >
                  <FaPlus aria-hidden="true" />
                  Create "Demo Anime" Collection
                </button>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "rgba(34, 197, 94, 0.14)",
                    border: "1px solid rgba(34, 197, 94, 0.35)",
                    fontSize: 12,
                  }}
                >
                  <FaCheck aria-hidden="true" />
                  <span>
                    <b>Demo Anime</b> collection created and active for search!
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {index === 1 && (
          <>
            <h3 className="scout-tour-title">Quest 2: Add Videos or Clips</h3>
            <p className="scout-tour-body">
              Next, you add full episodes (which AMVerge splits into scenes) or <b>pre-cut clips</b> (which skip scene
              detection). Load the sample tutorial clips to test it right now:
            </p>
            <div style={{ margin: "10px 0 4px" }}>
              {!step2Done ? (
                <button
                  type="button"
                  className="scout-tour-btn is-primary"
                  style={{ width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 6, padding: "8px 12px" }}
                  onClick={() => {
                    setDemoClipsLoaded(true);
                    setTimeout(() => setIndex(2), 400);
                  }}
                >
                  <FaVideo aria-hidden="true" />
                  Load 4 Sample Tutorial Clips
                </button>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "rgba(34, 197, 94, 0.14)",
                    border: "1px solid rgba(34, 197, 94, 0.35)",
                    fontSize: 12,
                  }}
                >
                  <FaCheck aria-hidden="true" />
                  <span>4 sample scenes scanned into <b>Demo Anime</b>!</span>
                </div>
              )}
            </div>
          </>
        )}

        {index === 2 && (
          <>
            <h3 className="scout-tour-title">Quest 3: Search by Description</h3>
            <p className="scout-tour-body">
              Click one of the sample descriptions below (or type your own) to see Scene Scout find the matching clip:
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
              {SAMPLE_CLIPS.map((clip) => {
                const active = matchedClip?.id === clip.id;
                return (
                  <button
                    key={clip.id}
                    type="button"
                    className={`scout-tour-btn${active ? " is-primary" : ""}`}
                    style={{ fontSize: 11, padding: "4px 9px" }}
                    onClick={() => runDemoSearch(clip.prompt)}
                  >
                    "{clip.prompt}"
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                type="text"
                value={demoQuery}
                onChange={(e) => setDemoQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && demoQuery.trim()) {
                    e.stopPropagation();
                    runDemoSearch(demoQuery);
                  }
                }}
                placeholder='Try "sword fight" or "sunset sky"...'
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  color: "white",
                  fontSize: 12,
                }}
              />
              <button
                type="button"
                className="scout-tour-btn is-primary"
                disabled={!demoQuery.trim()}
                onClick={() => runDemoSearch(demoQuery)}
              >
                <FaSearch aria-hidden="true" />
              </button>
            </div>

            {matchedClip && (
              <div
                style={{
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid rgba(34, 197, 94, 0.4)",
                  background: "rgba(0,0,0,0.45)",
                  marginBottom: 4,
                }}
              >
                {!videoFailed ? (
                  <video
                    key={matchedClip.videoUrl}
                    src={matchedClip.videoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    onError={() => setVideoFailed(true)}
                    style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      height: 90,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      background: "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(0,0,0,0.6))",
                      fontSize: 12,
                    }}
                  >
                    <FaPlay aria-hidden="true" />
                    <span>Matched scene: "{matchedClip.prompt}"</span>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    fontSize: 11,
                  }}
                >
                  <span>
                    <FaDatabase aria-hidden="true" style={{ marginRight: 5, opacity: 0.7 }} />
                    Demo Anime · <b>{matchedClip.title}</b>
                  </span>
                  <span style={{ color: "#22c55e", fontWeight: 600 }}>{matchedClip.score}</span>
                </div>
              </div>
            )}
          </>
        )}

        {index === 3 && (
          <>
            <h3 className="scout-tour-title">You're Ready! (Search & Match)</h3>
            <p className="scout-tour-body">
              That's the whole workflow: <b>Create Collection</b> → <b>Add Videos</b> → <b>Search</b>. You can also
              switch to the <b>Match</b> tab anytime to drop a clip and find scenes that visually flow from its last
              frame.
            </p>
          </>
        )}

        <div className="scout-tour-footer">
          <span className="scout-tour-count">
            {index + 1} / {totalSteps}
          </span>
          <div className="scout-tour-actions">
            {!last && (
              <button type="button" className="scout-tour-btn is-ghost" onClick={finish}>
                Skip
              </button>
            )}
            {index > 0 && (
              <button type="button" className="scout-tour-btn" onClick={back}>
                Back
              </button>
            )}
            <button
              type="button"
              className="scout-tour-btn is-primary"
              onClick={next}
              disabled={!canAdvance}
              title={!canAdvance ? "Complete the quest button above (or click Skip)" : undefined}
            >
              {last ? "Start using Scene Scout" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SceneScoutTour;
