import { useGeneralSettingsStore } from "../../stores/settingsStore";
import SettingRow from "../common/SettingRow";

export default function DiscordRPCSection() {
  const generalSettings = useGeneralSettingsStore();
  const setGeneralSettings = useGeneralSettingsStore.setState;
  return (
    <section className="panel menu-panel settings-panel">
      <h3>Discord Rich Presence</h3>
      <div className="about-content">

        <SettingRow
          label="Enable Rich Presence"
          description="Display your current AMVerge activity on your Discord profile."
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
              description="Shows the name of the video you are currently editing."
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
              description="Displays mini icons for editing, loading, and saving status."
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
              label="Show profile buttons"
              description='Adds "Discord Server" and "Website" buttons to your status.'
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
