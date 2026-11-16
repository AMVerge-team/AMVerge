import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { v1ImportSummary } from "../features/migration/importV1";
import { useEscapeToClose } from "./common/useEscapeToClose";

// banner image link (imgur etc.); empty or broken shows the placeholder
const BANNER_URL = "https://i.imgur.com/7g65E7d.jpeg";

/** shown once, on the launch that brought settings and episodes over from AMVerge 1 */
export function V1ImportNotice() {
  const { t } = useTranslation("jobs");
  const [open, setOpen] = useState(v1ImportSummary !== null);
  const [bannerFailed, setBannerFailed] = useState(false);
  const close = () => setOpen(false);
  useEscapeToClose(close, open);
  if (!open || !v1ImportSummary) return null;

  const { episodes } = v1ImportSummary;
  return (
    <div className="v1-import-overlay" role="dialog" aria-modal="true" aria-labelledby="v1-import-title">
      <div className="v1-import-modal">
        {BANNER_URL && !bannerFailed ? (
          <img className="v1-import-banner" src={BANNER_URL} alt="" onError={() => setBannerFailed(true)} />
        ) : (
          <div className="v1-import-banner v1-import-banner--placeholder">
            <span>AMVerge V2</span>
          </div>
        )}

        <div className="v1-import-content">
          <h2 id="v1-import-title" className="v1-import-title">{t("v1Import.title")}</h2>
          <p className="v1-import-lead">{t("v1Import.lead")}</p>

          <ul className="v1-import-list">
            <li>{t("v1Import.features.sceneDetection")}</li>
            <li>{t("v1Import.features.sceneSearch")}</li>
            <li>{t("v1Import.features.sceneMatching")}</li>
            <li>{t("v1Import.features.scenepack")}</li>

            {episodes > 0 ? <li>{t("v1Import.episodesInLibrary", { count: episodes })}</li> : null}
          </ul>

          <p className="v1-import-note">
            <Trans t={t} i18nKey="v1Import.note" components={{ br: <br />, strong: <strong /> }} />
          </p>

          <button type="button" className="v1-import-confirm" onClick={close} autoFocus>
            {t("v1Import.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
