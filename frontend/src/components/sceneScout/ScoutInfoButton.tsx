import { useTranslation } from "react-i18next";
import InfoButton from "../common/InfoButton";
import { useSceneScoutStore } from "../../stores/sceneScoutStore";

/** the "how does this work" popover, shared by the first-visit layout and the top toolbar; explains whichever tab is open */
export function ScoutInfoButton() {
  const mode = useSceneScoutStore((s) => s.mode);
  return mode === "flow" ? <FlowInfo /> : <SearchInfo />;
}

function SearchInfo() {
  const { t } = useTranslation("scout");
  return (
    <InfoButton title={t("info.search.title")} variant="toolbar">
      <p>{t("info.search.intro")}</p>

      <h4>{t("info.search.gettingStarted")}</h4>
      <ol>
        <li>{t("info.search.step1")}</li>
        <li>{t("info.search.step2")}</li>
        <li>{t("info.search.step3")}</li>
        <li>{t("info.search.step4")}</li>
      </ol>

      <h4>{t("info.search.settingsTitle")}</h4>
      <p>{t("info.search.settings")}</p>
    </InfoButton>
  );
}

function FlowInfo() {
  const { t } = useTranslation("scout");
  return (
    <InfoButton title={t("info.flow.title")} variant="toolbar">
      <p>{t("info.flow.intro")}</p>

      <h4>{t("info.flow.howTitle")}</h4>
      <ol>
        <li>{t("info.flow.step1")}</li>
        <li>{t("info.flow.step2")}</li>
        <li>{t("info.flow.step3")}</li>
      </ol>

      <h4>{t("info.flow.tipsTitle")}</h4>
      <p>{t("info.flow.tips")}</p>
    </InfoButton>
  );
}

export default ScoutInfoButton;
