import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useUIStateStore } from "../../stores/UIStore";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useAppStateStore } from "../../stores/appStore";
import { TUTORIAL_CLIPS } from "../../features/sceneScout/tutorialDemo";

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
  if (box.top + box.height + GAP + h <= vh - MARGIN) return { left: clampLeft(box.left), top: box.top + box.height + GAP };
  if (box.left + box.width + GAP + w <= vw - MARGIN) return { left: box.left + box.width + GAP, top: clampTop(box.top) };
  if (box.left - GAP - w >= MARGIN) return { left: box.left - GAP - w, top: clampTop(box.top) };
  return { left: clampLeft(box.left), top: clampTop(box.top - GAP - h) };
}

/** Interactive in-UI walkthrough: spotlights the real Scene Scout controls and lets the user click through each step. */
export function SceneScoutTour() {
  const setSeen = useUIStateStore((s) => s.setSceneScoutTourSeen);
  const setSidebarEnabled = useUIStateStore((s) => s.setSidebarEnabled);
  const setPreviewCollapsed = useUIStateStore((s) => s.setPreviewCollapsed);

  const tutorialStep = useSceneScoutStore((s) => s.tutorialStep);
  const startTutorial = useSceneScoutStore((s) => s.startTutorial);
  const endTutorial = useSceneScoutStore((s) => s.endTutorial);
  const setQuery = useSceneScoutStore((s) => s.setQuery);

  const focusedClipId = useAppStateStore((s) => s.focusedClipId);

  const [box, setBox] = useState<Box | null>(null);
  const [cardSize, setCardSize] = useState({ w: 340, h: 170 });
  const cardRef = useRef<HTMLDivElement>(null);

  const step = tutorialStep ?? 0;
  const previewDone = step === 3 && focusedClipId !== null;
  const displayStep = previewDone ? 4 : step;
  const totalSteps = 5;

  const finish = () => {
    endTutorial();
    setSeen(true);
  };

  // enter sandbox tutorial mode on mount, restore real workspace on unmount
  useEffect(() => {
    setSidebarEnabled(true);
    setPreviewCollapsed(false);
    startTutorial();
    return () => {
      useSceneScoutStore.getState().endTutorial();
    };
  }, [setSidebarEnabled, setPreviewCollapsed, startTutorial]);

  // auto-focus the real search input when reaching step 3
  useEffect(() => {
    if (step !== 2) return;
    const timer = window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('[data-scout-tour="search-field"] input');
      input?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [step]);

  const stepTargets =
    displayStep === 0
      ? ["hero-create-btn", "db-empty", "db-actions"]
      : displayStep === 1
        ? ["hero-add-btn", "add-episode"]
        : displayStep === 2
          ? ["search-field"]
          : displayStep === 3
            ? ["results-grid"]
            : ["preview-panel"];

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
  }, [displayStep]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCardSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [displayStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const fillRealSearch = (prompt: string) => {
    setQuery(prompt);
    const input = document.querySelector<HTMLInputElement>('[data-scout-tour="search-field"] input');
    input?.focus();
  };

  const pos = placeCard(box, cardSize.w, cardSize.h);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return createPortal(
    <div className="scout-tour is-interactive" role="dialog" aria-modal="false" aria-label="Scene Scout walkthrough">
      {box ? (
        <>
          {/* 4 invisible shields around the spotlight so only the real highlighted UI element is clickable */}
          <div className="scout-tour-shield" style={{ top: 0, left: 0, width: vw, height: Math.max(0, box.top) }} />
          <div
            className="scout-tour-shield"
            style={{ top: box.top + box.height, left: 0, width: vw, height: Math.max(0, vh - (box.top + box.height)) }}
          />
          <div className="scout-tour-shield" style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }} />
          <div
            className="scout-tour-shield"
            style={{
              top: box.top,
              left: box.left + box.width,
              width: Math.max(0, vw - (box.left + box.width)),
              height: box.height,
            }}
          />
          <div className="scout-tour-highlight" style={box} />
        </>
      ) : (
        <div className="scout-tour-dim" />
      )}

      <div ref={cardRef} className="scout-tour-card" style={pos}>
        {displayStep === 0 && (
          <>
            <h3 className="scout-tour-title">1. Create a Collection</h3>
            <p className="scout-tour-body">
              Click the highlighted <b>Create Collection</b> button to set up a demo collection for an anime series or
              clip pack.
            </p>
          </>
        )}

        {displayStep === 1 && (
          <>
            <h3 className="scout-tour-title">2. Add Videos or Clips</h3>
            <p className="scout-tour-body">
              Click <b>Add Videos</b> to load 4 sample scenes. In normal use, you can add full episodes or pre-cut clips
              (skipping scene detection).
            </p>
          </>
        )}

        {displayStep === 2 && (
          <>
            <h3 className="scout-tour-title">3. Search by Description</h3>
            <p className="scout-tour-body">
              Describe a scene in the highlighted search bar and press <b>Enter</b> (or click a suggestion to fill it):
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {TUTORIAL_CLIPS.map((clip) => (
                <button
                  key={clip.id}
                  type="button"
                  className="scout-tour-btn"
                  style={{ fontSize: 11, padding: "4px 8px" }}
                  onClick={() => fillRealSearch(clip.prompt)}
                >
                  "{clip.prompt}"
                </button>
              ))}
            </div>
          </>
        )}

        {displayStep === 3 && (
          <>
            <h3 className="scout-tour-title">4. Click a Scene to Preview</h3>
            <p className="scout-tour-body">
              Hover over any tile to watch it in the grid, or <b>click a scene</b> to open it in the Preview panel on the
              right.
            </p>
          </>
        )}

        {displayStep === 4 && (
          <>
            <h3 className="scout-tour-title">You're Ready!</h3>
            <p className="scout-tour-body">
              That's the whole workflow: <b>Create Collection</b> → <b>Add Videos</b> → <b>Search</b> →{" "}
              <b>Preview &amp; Export</b>. You can also switch to <b>Match</b> anytime to find scenes that visually flow
              from a clip.
            </p>
          </>
        )}

        <div className="scout-tour-footer">
          <span className="scout-tour-count">
            {displayStep + 1} / {totalSteps}
          </span>
          <div className="scout-tour-actions">
            {displayStep < 4 ? (
              <button type="button" className="scout-tour-btn is-ghost" onClick={finish}>
                Skip walkthrough
              </button>
            ) : (
              <button type="button" className="scout-tour-btn is-primary" onClick={finish}>
                Start using Scene Scout
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SceneScoutTour;
