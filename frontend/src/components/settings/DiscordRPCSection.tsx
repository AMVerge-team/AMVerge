import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { useDiscordRPCStatus } from "../../hooks/useDiscordRPC";
import DiscordPresencePreview from "./DiscordPresencePreview";
import SettingRow from "../common/SettingRow";

/**
 * What the connection is doing right now — the one thing about Rich Presence the
 * screen cannot show on its own. Discord being closed is normal, not a fault, so
 * "waiting" reads as a state rather than an error.
 */
function PresencePanel({ enabled }: { enabled: boolean }) {
  const status = useDiscordRPCStatus();

  let tone = "idle";
  let text = "Rich Presence is off.";
  if (enabled) {
    if (status?.connected) {
      tone = "live";
      text = status.user
        ? `Connected to Discord as ${status.user}.`
        : "Connected to Discord.";
    } else {
      tone = "waiting";
      text = "Waiting for Discord — open the app and this connects on its own.";
    }
  }

  return (
    <>
      <div className={`discord-rpc-status discord-rpc-status--${tone}`}>
        <span className="discord-rpc-status-dot" aria-hidden="true" />
        <p className="setting-description">{text}</p>
      </div>
      <DiscordPresencePreview activity={status?.activity ?? null} dim={!enabled} />
    </>
  );
}

export default function DiscordRPCSection() {
  const generalSettings = useGeneralSettingsStore();
  const setGeneralSettings = useGeneralSettingsStore.setState;
  return (
    <section className="panel menu-panel settings-panel">
      <h3>Discord Rich Presence</h3>
      <div className="about-content">

        <PresencePanel enabled={generalSettings.discordRPCEnabled} />

        <SettingRow
          label="Enable Rich Presence"
          description="Show what you're working on in AMVerge on your Discord profile."
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
              label="Show filename"
              description="Show the name of the video you're editing."
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
              label="Show status icons"
              description="Show small icons for editing, loading, and saving."
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
              label="Show elapsed time"
              description="Count how long AMVerge has been open, like a game session."
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
              label="Show profile buttons"
              description='Add "Discord Server" and "Website" buttons to your status.'
              control={
                <div className="settings-control">
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={generalSettings.rpcShowButtons}
                      onChange={(e) =>
                        setGeneralSettings((prev) => ({
                          ...prev,
                          rpcShowButtons: e.target.checked,
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
