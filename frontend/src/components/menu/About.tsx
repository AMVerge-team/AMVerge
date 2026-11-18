import { open } from "@tauri-apps/plugin-shell";
import { Trans, useTranslation } from "react-i18next";
import { FaQuestionCircle, FaWrench, FaKeyboard, FaGlobe, FaDiscord, FaGithub } from '../icons/animated';

// navigator.platform is deprecated but the only synchronous read
const IS_MAC = /mac/i.test(navigator.platform);

export default function About() {
  const { t } = useTranslation("menu");
  const rich = { strong: <strong />, code: <code /> };

  return (
    <section className="panel menu-panel about-panel">
      <div className="about-hero">
        <h2 className="about-hero-title">{t("about.title")}</h2>
        <p className="about-hero-subtitle">{t("about.subtitle")}</p>
      </div>

      <div className="about-grid">
        {/* Card 1: Key Features */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaQuestionCircle /></span>
            <h4>{t("about.what.title")}</h4>
          </div>
          <p className="about-card-text">{t("about.what.p1")}</p>
          <p className="about-card-text">{t("about.what.p2")}</p>
          <p className="about-card-text">{t("about.what.p3")}</p>
        </div>

        {/* Card 2: Recommended Workflow */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaWrench /></span>
            <h4>{t("about.workflow.title")}</h4>
          </div>
          <ol className="about-card-steps">
            <li>
              <span className="step-num">1</span>
              <div>
                <Trans t={t} i18nKey="about.workflow.import" components={rich} />
              </div>
            </li>
            <li>
              <span className="step-num">2</span>
              <div>
                <Trans t={t} i18nKey="about.workflow.select" components={rich} />
              </div>
            </li>
            <li>
              <span className="step-num">3</span>
              <div>
                <Trans t={t} i18nKey="about.workflow.export" components={rich} />
              </div>
            </li>
          </ol>
        </div>

        {/* Card 3: Shortcuts & Controls */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaKeyboard /></span>
            <h4>{t("about.shortcuts.title")}</h4>
          </div>
          <div className="about-shortcuts-table">
            <div className="shortcut-row">
              <span className="shortcut-key">{t("about.shortcuts.singleClick")}</span>
              <span className="shortcut-desc">{t("about.shortcuts.singleClickDesc")}</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">{t("about.shortcuts.ctrlClick")}</span>
              <span className="shortcut-desc">{t("about.shortcuts.ctrlClickDesc")}</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">{t("about.shortcuts.shiftClick")}</span>
              <span className="shortcut-desc">{t("about.shortcuts.shiftClickDesc")}</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">{IS_MAC ? t("about.shortcuts.cmdScroll") : t("about.shortcuts.ctrlScroll")}</span>
              <span className="shortcut-desc">{t("about.shortcuts.scrollDesc")}</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">{t("about.shortcuts.esc")}</span>
              <span className="shortcut-desc">{t("about.shortcuts.escDesc")}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Community & Links */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaGlobe /></span>
            <h4>{t("about.community.title")}</h4>
          </div>
          <p className="about-card-text">{t("about.community.text")}</p>
          <div className="about-links-group">
            <button
              className="about-link-btn discord"
              onClick={() => void open("https://discord.gg/bmXjTgsAaN")}
            >
              <FaDiscord style={{ marginRight: 8, fontSize: "1.1rem" }} />
              {t("about.community.discord")}
            </button>
            <button
              className="about-link-btn github"
              onClick={() => void open("https://github.com/AMVerge-team/AMVerge")}
            >
              <FaGithub style={{ marginRight: 8, fontSize: "1.1rem" }} />
              {t("about.community.github")}
            </button>
          </div>
          <div className="about-author-note">
            <em><Trans t={t} i18nKey="about.community.authorNote" components={rich} /></em>
          </div>
        </div>
      </div>
    </section>
  );
}