import { useState } from "react";
import { useTranslation } from "react-i18next";
import InfoButton from "../common/InfoButton";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";
import { useUIStateStore } from "../../stores/UIStore";

type InfoTab = "search" | "flow" | "faq";

/** Scene Scout guide popover with Search, Match, and FAQ & Tips tabs + a button to launch the interactive walkthrough. */
export function ScoutInfoButton() {
  const mode = useSceneScoutStore((s) => s.mode);
  const setTourSeen = useUIStateStore((s) => s.setSceneScoutTourSeen);
  const [tab, setTab] = useState<InfoTab>(mode === "flow" ? "flow" : "search");

  const startWalkthrough = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    window.setTimeout(() => setTourSeen(false), 0);
  };

  return (
    <InfoButton title="Scene Scout Guide" variant="toolbar" modalClassName="scout-guide-modal">
      <div
        className="scene-scout-mode-tabs scout-info-tabs"
        role="tablist"
        aria-label="Scene Scout guide sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "search"}
          className={`scene-scout-mode-tab${tab === "search" ? " is-active" : ""}`}
          onClick={() => setTab("search")}
        >
          Search
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "flow"}
          className={`scene-scout-mode-tab${tab === "flow" ? " is-active" : ""}`}
          onClick={() => setTab("flow")}
        >
          Match
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "faq"}
          className={`scene-scout-mode-tab${tab === "faq" ? " is-active" : ""}`}
          onClick={() => setTab("faq")}
        >
          FAQ &amp; Tips
        </button>
      </div>

      <div className="scout-guide-scroll">
        {tab === "search" && <SearchInfo />}
        {tab === "flow" && <FlowInfo />}
        {tab === "faq" && <FaqInfo />}
      </div>

      <div className="scout-guide-footer">
        <button
          type="button"
          className="event-host-btn"
          style={{ fontSize: 12, padding: "7px 14px" }}
          onClick={startWalkthrough}
        >
          Start Interactive Walkthrough
        </button>
      </div>
    </InfoButton>
  );
}

function SearchInfo() {
  const { t } = useTranslation("scout");
  return (
    <>
      <p>{t("info.search.intro")}</p>

      <h4>{t("info.search.gettingStarted")}</h4>
      <ol>
        <li>{t("info.search.step1")}</li>
        <li>{t("info.search.step2")}</li>
        <li>{t("info.search.step3")}</li>
        <li>{t("info.search.step4")}</li>
      </ol>

      <h4>Scene Detection Modes</h4>
      <ul>
        <li>
          <b>AI Scene Detection:</b> Runs AI on full anime episodes for accurate scene cut points.
        </li>
        <li>
          <b>Keyframe Detection:</b> Fast scene cuts at video keyframes; works quickly on any PC.
        </li>
        <li>
          <b>Skip detection:</b> Treat each file as 1 scene (best for pre-cut flow clips or scenepack folders).
        </li>
      </ul>

      <h4>{t("info.search.settingsTitle")}</h4>
      <p>{t("info.search.settings")}</p>
    </>
  );
}

function FlowInfo() {
  const { t } = useTranslation("scout");
  return (
    <>
      <p>{t("info.flow.intro")}</p>

      <h4>{t("info.flow.howTitle")}</h4>
      <ol>
        <li>{t("info.flow.step1")}</li>
        <li>{t("info.flow.step2")}</li>
        <li>{t("info.flow.step3")}</li>
      </ol>

      <h4>What it matches</h4>
      <ul>
        <li>
          <b>Visual look:</b> Compares color palette, lighting, camera angle, and scene layout.
        </li>
        <li>
          <b>Cross-series matches:</b> Searches every active collection at once to find parallel shots or similar
          scenes across different anime.
        </li>
      </ul>

      <h4>{t("info.flow.tipsTitle")}</h4>
      <p>{t("info.flow.tips")}</p>
    </>
  );
}

function FaqInfo() {
  return (
    <>
      <h4>Is Scene Scout local or in the cloud?</h4>
      <p>
        <b>100% local on your computer.</b> Your anime episodes, clips, and <code>.scoutdb</code> collection files stay
        on your drive and are never uploaded.
      </p>

      <h4>How do I manage or delete collections and videos?</h4>
      <ul>
        <li>
          <b>Include / Exclude from search:</b> Click a collection's checkbox in the left sidebar (or double-click the
          row).
        </li>
        <li>
          <b>Hide specific episodes:</b> Hover an active collection and click the <b>eye icon</b>, or right-click any
          video row and choose <b>Hide from searches</b>.
        </li>
        <li>
          <b>Rename, Reveal, or Delete:</b> Right-click any collection or video row to rename it, reveal its file in
          Finder / Explorer, remove it from the list, or permanently delete the collection from disk.
        </li>
      </ul>

      <h4>Can I import or share a collection file?</h4>
      <p>
        Yes. Click the <b>Import a collection file (.scoutdb)</b> icon at the top of the left sidebar (or right-click
        empty space in the sidebar) to open any existing <code>.scoutdb</code> file.
      </p>
    </>
  );
}

export default ScoutInfoButton;
