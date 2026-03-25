import { useEffect, useId, useState } from "react";
import {
  applyThemeSettings,
  loadThemeSettings,
  saveThemeSettings,
  type ThemeSettings,
} from "../theme";

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  const accentId = useId();
  const bgGradientId = useId();
  const bgId = useId();

  const [settings, setSettings] = useState<ThemeSettings>(() => loadThemeSettings());

  useEffect(() => {
    applyThemeSettings(settings);
    saveThemeSettings(settings);
  }, [settings]);

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>Customization</h3>

        <div className="settings-row">
          <label className="settings-label" htmlFor={accentId}>
            Accent color
          </label>
          <div className="settings-control">
            <input
              id={accentId}
              type="color"
              value={settings.accentColor}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, accentColor: e.target.value }))
              }
              aria-label="Accent color"
            />
            <span className="settings-value">{settings.accentColor.toUpperCase()}</span>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label" htmlFor={bgGradientId}>
            Background gradient
          </label>
          <div className="settings-control">
            <input
              id={bgGradientId}
              type="color"
              value={settings.backgroundGradientColor}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  backgroundGradientColor: e.target.value,
                }))
              }
              aria-label="Background gradient color"
            />
            <span className="settings-value">
              {settings.backgroundGradientColor.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label" htmlFor={bgId}>
            Background image
          </label>
          <div className="settings-control">
            <input
              id={bgId}
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const dataUrl = await fileToDataUrl(file);
                setSettings((prev) => ({ ...prev, backgroundImageDataUrl: dataUrl }));
              }}
            />
            <button
              className="buttons"
              type="button"
              onClick={() =>
                setSettings((prev) => ({ ...prev, backgroundImageDataUrl: null }))
              }
              disabled={!settings.backgroundImageDataUrl}
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section settings-placeholder">
        <h3>More</h3>
        <p>gonna add more settings here, send suggestions of any setting you think should be tuneable</p>
      </section>
    </div>
  );
}
