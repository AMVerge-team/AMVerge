import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
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
  titleKey: string;
  bodyKey: string;
  interactive?: boolean;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    targets: [],
    titleKey: "steps.0.title",
    bodyKey: "steps.0.body",
  },
  {
    id: "library",
    targets: ["nav-home"],
    titleKey: "steps.1.title",
    bodyKey: "steps.1.body",
  },
  {
    id: "scenepacks",
    targets: ["nav-scenepacks"],
    titleKey: "steps.2.title",
    bodyKey: "steps.2.body",
  },
  {
    id: "sceneScout",
    targets: ["nav-sceneScout"],
    titleKey: "steps.3.title",
    bodyKey: "steps.3.body",
  },
  {
    id: "events",
    targets: ["nav-events"],
    titleKey: "steps.4.title",
    bodyKey: "steps.4.body",
  },
  {
    id: "menu",
    targets: ["menu-btn"],
    interactive: true,
    titleKey: "steps.5.title",
    bodyKey: "steps.5.body",
  },
  {
    id: "quickSettings",
    targets: ["quick-settings"],
    interactive: true,
    titleKey: "steps.6.title",
    bodyKey: "steps.6.body",
  },
  {
    id: "sceneDetection",
    targets: ["scene-detection"],
    titleKey: "steps.7.title",
    bodyKey: "steps.7.body",
  },
  {
    id: "previewMethod",
    targets: ["preview-method"],
    titleKey: "steps.8.title",
    bodyKey: "steps.8.body",
  },
  {
    id: "features",
    targets: ["features-list", "settings-tab-features"],
    titleKey: "steps.9.title",
    bodyKey: "steps.9.body",
  },
  {
    id: "done",
    targets: ["how-to-use"],
    titleKey: "steps.10.title",
    bodyKey: "steps.10.body",
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
  const { t } = useTranslation("gettingStarted");
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
      aria-label={t("ariaLabel")}
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
        <h3 className="scout-tour-title">{t(step.titleKey)}</h3>
        <p className="scout-tour-body"><Trans t={t} i18nKey={step.bodyKey} components={{ b: <b />, br: <br /> }} /></p>

        <div className="scout-tour-footer">
          <span className="scout-tour-count">
            {Math.min(index, STEPS.length - 1) + 1} / {STEPS.length}
          </span>
          <div className="scout-tour-actions">
            {!last && (
              <button type="button" className="scout-tour-btn is-ghost" onClick={finish}>
                {t("skip")}
              </button>
            )}
            {index > 0 && (
              <button type="button" className="scout-tour-btn" onClick={back}>
                {t("back")}
              </button>
            )}
            <button type="button" className="scout-tour-btn is-primary" onClick={next}>
              {last ? t("finish") : t("next")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default GettingStartedTour;
