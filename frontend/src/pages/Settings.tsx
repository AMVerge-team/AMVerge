import GeneralSettings from "../components/settings/GeneralSettings";
import AppearanceSection from "../components/settings/AppearanceSection";
import FeaturesSection from "../components/settings/FeaturesSection";
import DiscordRPCSection from "../components/settings/DiscordRPCSection";
import ExportSection from "../components/settings/exportSettings/ExportSection";
import { useUIStateStore } from "../stores/UIStore";

const PAGES = [
  { key: "general", label: "General" },
  { key: "export", label: "Export" },
  { key: "appearance", label: "Appearance" },
  { key: "features", label: "Features" },
  { key: "discord", label: "Discord RPC" },
];

type SettingsProps = {
  onGeneralSettingsReset: () => void;
  onEpisodesPathChanged: (oldPath: string, newPath: string) => void;
  onThemeReset: () => void;
};

export default function Settings({
  onGeneralSettingsReset,
  onEpisodesPathChanged,
  onThemeReset,
}: SettingsProps) {
  const activeTab = useUIStateStore(s => s.settingsTab);
  const setActiveTab = useUIStateStore(s => s.setSettingsTab);
  return (
    <div className="menu-page">
      <div className="menu-header">
        <h2 className="menu-title">Settings</h2>
        <div className="menu-nav">
          {PAGES.map((page) => (
            <button
              key={page.key}
              className={`menu-nav-btn${activeTab === page.key ? " active" : ""}`}
              onClick={() => setActiveTab(page.key)}
            >
              {page.label}
            </button>
          ))}
        </div>
      </div>

      <div className="menu-content">
        <div className="menu-section">
          <div className="settings-tab-content">
            {activeTab === "general" && (
              <GeneralSettings
                onGeneralSettingsReset={onGeneralSettingsReset}
                onEpisodesPathChanged={onEpisodesPathChanged}
              />
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
