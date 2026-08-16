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
