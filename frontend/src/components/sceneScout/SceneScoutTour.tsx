import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useUIStateStore } from "../../stores/UIStore";

type Step = {
  /** data-scout-tour anchors to highlight, first one on screen wins; none on screen centers the card */
  targets: string[];
  title: string;
  body: ReactNode;
  /** only part of some layouts, so left out when its target is missing instead of centered */
  optional?: boolean;
};

const STEPS: Step[] = [
  {
    targets: [],
    title: "Welcome to Scene Scout",
    body: (
      <>
        Find any scene by describing it, like <i>"girl crying in the rain"</i>. Scene Scout indexes your
        episodes into a <b>database</b> once, then searches them in seconds. Here is how it fits together.
      </>
    ),
  },
  {
    targets: ["db-actions"],
    title: "1. Create or open a database",
    body: (
      <>
        Use <b>+</b> to create a new database, or the <b>database arrow</b> to import a database file you already have. One
        database per series works well.
      </>
    ),
  },
  {
    targets: ["all-databases", "db-empty"],
    title: "2. All databases",
    body: (
      <>
        Every database you created or opened is listed here. Being in this list does <b>not</b> mean it
        gets searched. To search one, <b>double-click</b> it or <b>drag</b> it up into Searching.
      </>
    ),
  },
  {
    targets: ["searching", "db-empty"],
    title: "3. Searching",
    body: (
      <>
        Only databases in <b>Searching</b> are searched. Move one up by <b>double-clicking</b> it,{" "}
        <b>dragging</b> it here, or <b>right-clicking</b> it. Expand a database here to search only some of
        its episodes.
      </>
    ),
  },
  {
    targets: ["hero-dbs"],
    title: "Quick pick",
    body: <>Clicking a database here also adds it to Searching, or takes it out again.</>,
    optional: true,
  },
  {
    targets: ["add-episode"],
    title: "4. Add episodes",
    body: (
      <>
        <b>Import</b> indexes episodes into the selected database. It takes a while, but only once per
        episode.
      </>
    ),
  },
  {
    targets: ["search-field"],
    title: "5. Describe a scene",
    body: (
      <>
        Type what you remember and press <b>Enter</b>. Click a result to preview it, then export it like
        any clip.
      </>
    ),
  },
  {
    targets: ["mode-tabs"],
    title: "Search and Flow",
    body: (
      <>
        <b>Search</b> finds scenes from a description. <b>Flow</b> takes a clip you already have and finds
        scenes that look like they could come right after it.
      </>
    ),
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

// right of the target, else left, else below, else above, always kept on screen
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

/** first-visit walkthrough of scene scout, highlighting each part of the page in turn */
export function SceneScoutTour() {
  const setSeen = useUIStateStore((s) => s.setSceneScoutTourSeen);
  const setSidebarEnabled = useUIStateStore((s) => s.setSidebarEnabled);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardSize, setCardSize] = useState({ w: 340, h: 180 });
  const cardRef = useRef<HTMLDivElement>(null);

  const steps = STEPS.filter((s) => !s.optional || findTarget(s.targets));
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  const finish = () => setSeen(true);
  const next = () => (last ? finish() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // the databases live in the sidebar, so it has to be showing
  useEffect(() => {
    setSidebarEnabled(true);
  }, [setSidebarEnabled]);

  // follows the target while the layout settles or the window resizes
  useEffect(() => {
    let frame = 0;
    let prev = "";
    const tick = () => {
      const found = findTarget(step.targets);
      const key = JSON.stringify(found);
      if (key !== prev) {
        prev = key;
        setBox(found);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCardSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const pos = placeCard(box, cardSize.w, cardSize.h);

  return createPortal(
    <div className="scout-tour" role="dialog" aria-modal="true" aria-label="Scene Scout walkthrough">
      {box ? (
        <div className="scout-tour-highlight" style={box} />
      ) : (
        <div className="scout-tour-dim" />
      )}

      <div ref={cardRef} className="scout-tour-card" style={pos}>
        <h3 className="scout-tour-title">{step.title}</h3>
        <p className="scout-tour-body">{step.body}</p>

        <div className="scout-tour-footer">
          <span className="scout-tour-count">
            {Math.min(index, steps.length - 1) + 1} / {steps.length}
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
            <button type="button" className="scout-tour-btn is-primary" onClick={next}>
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default SceneScoutTour;
