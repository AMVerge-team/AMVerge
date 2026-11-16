import { useTranslation } from "react-i18next";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { useDiscordRPCStatus } from "../../hooks/useDiscordRPC";
import DiscordPresencePreview from "./DiscordPresencePreview";
import SettingRow from "../common/SettingRow";

/** Discord being closed is normal, so "waiting" reads as a state, not an error */
function PresencePanel({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation("settings");
  const status = useDiscordRPCStatus();

  let tone = "idle";
  let text = t("discord.status.off");
  if (enabled) {
    if (status?.connected) {
      tone = "live";
      text = status.user
        ? t("discord.status.connectedAs", { user: status.user })
        : t("discord.status.connected");
    } else {
      tone = "waiting";
      text = t("discord.status.waiting");
    }
  }

  return (
    <div className={`discord-presence discord-presence--${tone}`}>
      <div className="discord-presence-status">
        <span className="discord-presence-dot" aria-hidden="true" />
        <p className="setting-description">{text}</p>
      </div>
      <DiscordPresencePreview activity={status?.activity ?? null} dim={!enabled} />
    </div>
  );
}

export default function DiscordRPCSection() {
  const { t } = useTranslation("settings");
  const generalSettings = useGeneralSettingsStore();
  const setGeneralSettings = useGeneralSettingsStore.setState;
  return (
    <section className="panel menu-panel settings-panel">
      <h3>{t("discord.title")}</h3>
      <div className="about-content">

        <PresencePanel enabled={generalSettings.discordRPCEnabled} />

        <SettingRow
          label={t("discord.enable.label")}
          description={t("discord.enable.description")}
          control={
            <div className="settings-control">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={generalSettings.discordRPCEnabled}
                  onChange={(e) =>
                    setGeneralSettings((prev) => ({
                      ...prev,
                      discordRPCEnabled: e.target.checked,
                    }))
                  }
                />
                <span className="checkmark"></span>
              </label>
            </div>
          }
        />

        {generalSettings.discordRPCEnabled && (
          <>
            <SettingRow
              label={t("discord.filename.label")}
              description={t("discord.filename.description")}
              control={
                <div className="settings-control">
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={generalSettings.rpcShowFilename}
                      onChange={(e) =>
                        setGeneralSettings((prev) => ({
                          ...prev,
                          rpcShowFilename: e.target.checked,
                        }))
                      }
                    />
                    <span className="checkmark"></span>
                  </label>
                </div>
              }
            />

            <SettingRow
              label={t("discord.statusIcons.label")}
              description={t("discord.statusIcons.description")}
              control={
                <div className="settings-control">
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={generalSettings.rpcShowMiniIcons}
                      onChange={(e) =>
                        setGeneralSettings((prev) => ({
                          ...prev,
                          rpcShowMiniIcons: e.target.checked,
                        }))
                      }
                    />
                    <span className="checkmark"></span>
                  </label>
                </div>
              }
            />

            <SettingRow
              label={t("discord.elapsed.label")}
              description={t("discord.elapsed.description")}
              control={
                <div className="settings-control">
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={generalSettings.rpcShowElapsed}
                      onChange={(e) =>
                        setGeneralSettings((prev) => ({
                          ...prev,
                          rpcShowElapsed: e.target.checked,
                        }))
                      }
                    />
                    <span className="checkmark"></span>
                  </label>
                </div>
              }
            />

            <SettingRow
              label={t("discord.links.label")}
              description={t("discord.links.description")}
              control={
                <div className="settings-control">
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={generalSettings.rpcShowLinks}
                      onChange={(e) =>
                        setGeneralSettings((prev) => ({
                          ...prev,
                          rpcShowLinks: e.target.checked,
                        }))
                      }
                    />
                    <span className="checkmark"></span>
                  </label>
                </div>
              }
            />
          </>
        )}
      </div>
    </section>
  );
}
