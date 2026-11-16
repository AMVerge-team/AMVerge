import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useUIStateStore } from "../stores/UIStore";
import { useSettingsSectionsStore } from "../stores/settingsSectionsStore";

type StepId =
  | "welcome"
  | "library"
  | "scenepacks"
  | "sceneScout"
  | "events"
  | "menu"
  | "quickSettings"
  | "sceneDetection"
  | "previewMethod"
  | "features"
  | "done";

type Step = {
  id: StepId;
  targets: string[];
  title: string;
  body: ReactNode;
  interactive?: boolean;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    targets: [],
    title: "Welcome to AMVerge",
    body: (
      <>
        Let&apos;s take a quick lap around AMVerge so you know where every page lives, how imports and
        previews work, and where to unlock optional AI features.
      </>
    ),
  },
  {
    id: "library",
    targets: ["nav-home"],
    title: "1. Library",
    body: (
      <>
        <b>Library</b> is your home workspace. Import episodes or video files here to split them into
        scenes, hover to preview every cut, and export the clips you select straight to your editor.
      </>
    ),
  },
  {
    id: "scenepacks",
    targets: ["nav-scenepacks"],
    title: "2. Scenepacks",
    body: (
      <>
        <b>Scenepacks</b> lets you group favorite clips from any episode into custom collections by
        character, mood, etc. You can turn it on anytime in <b>Settings › Features</b>.
      </>
    ),
  },
  {
    id: "sceneScout",
    targets: ["nav-sceneScout"],
    title: "3. Scene Scout",
    body: (
      <>
        <b>Scene Scout</b> searches across your indexed episodes from a plain-English description (or
        finds clips that flow from a clip you already have). Enable and download it anytime in{" "}
        <b>Settings › Features</b>.
      </>
    ),
  },
  {
    id: "events",
    targets: ["nav-events"],
    title: "4. Community Events",
    body: (
      <>
        <b>Events</b> lists active AMV contests and Hour Challenges from the community. Browse active
        brackets, join their Discord servers, or sign in with Discord to host your own.
      </>
    ),
  },
  {
    id: "menu",
    targets: ["menu-btn"],
    interactive: true,
    title: "5. Open the Menu",
    body: (
      <>
        Click the <b>☰ menu button</b> right next to the AMVerge logo to open Quick Navigation, or press{" "}
        <b>Next</b> to jump straight in.
      </>
    ),
  },
  {
    id: "quickSettings",
    targets: ["quick-settings"],
    interactive: true,
    title: "6. Open Settings",
    body: (
      <>
        Click <b>Settings</b> here to configure how AMVerge detects cuts, plays previews, and installs
        optional features.
      </>
    ),
  },
  {
    id: "sceneDetection",
    targets: ["scene-detection"],
    title: "7. Scene Detection Methods",
    body: (
      <>
        Choose how imports find cuts:
        <br />• <b>Keyframe Detection</b> cuts instantly on video keyframes and works on any PC with no
        GPU.
        <br />• <b>AI Scene Detection</b> checks every frame with TransNetV2 for exact shot changes
        (slower without a GPU; install anytime).
      </>
    ),
  },
  {
    id: "previewMethod",
    targets: ["preview-method"],
    title: "8. Preview Methods",
    body: (
      <>
        Choose how the grid plays clips when you hover:
        <br />• <b>Video Files</b> cuts real video clips per scene so previews match your export.
        <br />• <b>WebP Files</b> builds lightweight animated previews for smoother scrolling and lower
        memory usage (exports still cut from full quality).
      </>
    ),
  },
  {
    id: "features",
    targets: ["features-list", "settings-tab-features"],
    title: "9. Features & Downloads",
    body: (
      <>
        In <b>Features</b> you can switch on and download optional tools whenever you want them,
        including <b>Scene Scout</b>, <b>AI Scene Detection</b>, <b>Scenepacks</b>, <b>Upscaling</b>,
        and <b>Depth Maps</b>.
      </>
    ),
  },
  {
    id: "done",
    targets: ["how-to-use"],
    title: "10. All Set",
    body: (
      <>
        That&apos;s about it for the tutorial, if you need this guide again, it&apos;s located in the{" "}
        <b>&quot;How to Use&quot;</b> section on the right side of the page. Enjoy!
      </>
    ),
  },
];

type Box = { top: number; left: number; width: number; height: number };

const PAD = 6;
const GAP = 14;
const MARGIN = 12;

function findTargetElement(targets: string[]): HTMLElement | null {
  for (const target of targets) {
    const el = document.querySelector(`[data-getting-started="${target}"]`) as HTMLElement | null;
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
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

/** app-wide first-visit walkthrough, replayable from "How to use" in Library */
export function GettingStartedTour() {
  const quickMenuOpen = useUIStateStore((s) => s.quickMenuOpen);
  const settingsOpen = useUIStateStore((s) => s.settingsOpen);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardSize, setCardSize] = useState({ w: 360, h: 210 });
  const cardRef = useRef<HTMLDivElement>(null);

  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const last = index >= STEPS.length - 1;

  const finish = () => {
    const ui = useUIStateStore.getState();
    ui.setQuickMenuOpen(false);
    ui.closeSettings();
    ui.setActivePage("home");
    ui.setGettingStartedSeen(true);
  };

  const syncUiForStep = (stepId: StepId) => {
    const ui = useUIStateStore.getState();
    const sections = useSettingsSectionsStore.getState();
    if (stepId === "welcome" || stepId === "library" || stepId === "scenepacks" || stepId === "sceneScout" || stepId === "events") {
      ui.setQuickMenuOpen(false);
      ui.closeSettings();
      ui.setActivePage("home");
      if (stepId !== "welcome") ui.setSidebarEnabled(true);
    } else if (stepId === "menu") {
      ui.closeSettings();
      ui.setQuickMenuOpen(false);
    } else if (stepId === "quickSettings") {
      ui.closeSettings();
      ui.setQuickMenuOpen(true);
    } else if (stepId === "sceneDetection") {
      sections.setSectionOpen("general.import", true);
      ui.openSettings("general");
    } else if (stepId === "previewMethod") {
      sections.setSectionOpen("general.preview", true);
      ui.openSettings("general");
    } else if (stepId === "features") {
      sections.setSectionOpen("features.list", true);
      ui.openSettings("features");
    } else if (stepId === "done") {
      ui.setQuickMenuOpen(false);
      ui.closeSettings();
      ui.setActivePage("home");
      ui.setPreviewCollapsed(false);
      ui.setHowToUseExpanded(true);
    }
  };

  const goTo = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, nextIndex));
    syncUiForStep(STEPS[clamped].id);
    setIndex(clamped);
  };

  const next = () => (last ? finish() : goTo(index + 1));
  const back = () => goTo(index - 1);

  // ensure sidebar is visible on initial mount when starting in Library
  useEffect(() => {
    syncUiForStep("welcome");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // if the user clicks the ☰ button or the Settings card directly, advance automatically
  useEffect(() => {
    if (step.id === "menu" && quickMenuOpen) {
      setIndex((i) => (STEPS[i]?.id === "menu" ? i + 1 : i));
    } else if (step.id === "quickSettings" && settingsOpen) {
      useSettingsSectionsStore.getState().setSectionOpen("general.import", true);
      useUIStateStore.getState().setSettingsTab("general");
      setIndex((i) => (STEPS[i]?.id === "quickSettings" ? i + 1 : i));
    }
  }, [step.id, quickMenuOpen, settingsOpen]);

  // keep the highlight box locked to its settled target (no pre-scroll jump or modal-mount flicker)
  useEffect(() => {
    if (step.targets.length === 0) {
      setBox(null);
      return;
    }

    let frame = 0;
    let prev = "";
    let scrolledForStep = false;
    const needsScroll =
      step.id === "sceneDetection" ||
      step.id === "previewMethod" ||
      step.id === "features" ||
      step.id === "done";

    const tick = () => {
      const el = findTargetElement(step.targets);
      if (el) {
        if (needsScroll && !scrolledForStep) {
          el.scrollIntoView({ block: "center", behavior: "auto" });
          scrolledForStep = true;
        }
        const modalShell = el.closest(".app-modal, .quick-menu-dialog");
        const modalAnimating =
          modalShell?.getAnimations().some((anim) => anim.playState === "running") ?? false;
        if (!modalAnimating) {
          const r = el.getBoundingClientRect();
          const found: Box = {
            top: r.top - PAD,
            left: r.left - PAD,
            width: r.width + PAD * 2,
            height: r.height + PAD * 2,
          };
          const key = JSON.stringify(found);
          if (key !== prev) {
            prev = key;
            setBox(found);
          }
        }
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
  const interactiveHole = Boolean(step.interactive && box);

  return createPortal(
    <div
      className={`scout-tour${interactiveHole ? " is-interactive" : ""}`}
      role="dialog"
      aria-modal={!interactiveHole}
      aria-label="Getting started guide"
    >
      {interactiveHole && box ? (
        <>
          <div className="scout-tour-shield" style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
          <div
            className="scout-tour-shield"
            style={{ top: Math.max(0, box.top), left: 0, width: Math.max(0, box.left), height: box.height }}
          />
          <div
            className="scout-tour-shield"
            style={{ top: Math.max(0, box.top), left: box.left + box.width, right: 0, height: box.height }}
          />
          <div
            className="scout-tour-shield"
            style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }}
          />
        </>
      ) : null}

      {box ? <div className="scout-tour-highlight" style={box} /> : <div className="scout-tour-dim" />}

      <div ref={cardRef} className="scout-tour-card" style={pos}>
        <h3 className="scout-tour-title">{step.title}</h3>
        <p className="scout-tour-body">{step.body}</p>

        <div className="scout-tour-footer">
          <span className="scout-tour-count">
            {Math.min(index, STEPS.length - 1) + 1} / {STEPS.length}
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
              {last ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default GettingStartedTour;
