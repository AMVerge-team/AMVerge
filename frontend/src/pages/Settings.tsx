import { useTranslation } from "react-i18next";
import GeneralSettings from "../components/settings/GeneralSettings";
import AppearanceSection from "../components/settings/AppearanceSection";
import FeaturesSection from "../components/settings/FeaturesSection";
import DiscordRPCSection from "../components/settings/DiscordRPCSection";
import ExportSection from "../components/settings/exportSettings/ExportSection";
import { useUIStateStore } from "../stores/UIStore";
import { useTabKeys } from "../components/common/useTabKeys";

const PAGES = [
  { key: "general" },
  { key: "export" },
  { key: "appearance" },
  { key: "features" },
  { key: "discord" },
];

type SettingsProps = {
  onGeneralSettingsReset: () => void;
  onThemeReset: () => void;
};

export default function Settings({
  onGeneralSettingsReset,
  onThemeReset,
}: SettingsProps) {
  const { t } = useTranslation("shell");
  const activeTab = useUIStateStore(s => s.settingsTab);
  const setActiveTab = useUIStateStore(s => s.setSettingsTab);
  useTabKeys(PAGES.map((page) => page.key), activeTab, setActiveTab);

  return (
    <div className="menu-page">
      <div className="menu-header">
        <h2 className="menu-title">{t("settingsPage.title")}</h2>
        <div className="menu-nav">
          {PAGES.map((page) => (
            <button
              key={page.key}
              className={`menu-nav-btn${activeTab === page.key ? " active" : ""}`}
              onClick={() => setActiveTab(page.key)}
            >
              {t(`settingsPage.tabs.${page.key}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="menu-content">
        <div className="menu-section">
          <div className="settings-tab-content">
            {activeTab === "general" && (
              <GeneralSettings onGeneralSettingsReset={onGeneralSettingsReset} />
            )}

            {activeTab === "appearance" && (
              <AppearanceSection
                onThemeReset={onThemeReset}
              />
            )}

            {activeTab === "export" && (
              <ExportSection />
            )}

            {activeTab === "features" && (
              <FeaturesSection />
            )}

            {activeTab === "discord" && (
              <DiscordRPCSection />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
