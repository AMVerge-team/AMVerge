import { useId, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  getDarkerColor,
  isVideoBackgroundPath,
  useThemeSettingsStore,
} from "../../stores/settingsStore";
import {
  ACCENT_PRESET_COLORS,
  GRADIENT_PRESET_COLORS,
  findAccentPreset,
  isPresetGradient,
} from "../../features/theme/colorPresets";
import ColorPicker from "../common/ColorPicker";
import CropModal from "../common/CropModal";
import SettingRow from "../common/SettingRow";
import SettingsSection from "../common/SettingsSection";

type AppearanceSectionProps = {
  onThemeReset: () => void;
};

export default function AppearanceSection({
  onThemeReset
}: AppearanceSectionProps) {
  const themeSettings = useThemeSettingsStore();
  const setThemeSettings = useThemeSettingsStore.setState;
  const bgOpacityId = useId();
  const bgBlurId = useId();
  const gridPreviewSpeedId = useId();

  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [originalPath, setOriginalPath] = useState<string | null>(null);
  const cropRequestVersionRef = useRef(0);

  const handlePickBackgroundMedia = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Media",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "bmp",
            "tif",
            "tiff",
            "mp4",
            "webm",
            "mov",
            "mkv",
            "avi",
            "m4v",
          ],
        },
      ],
    });

    if (!selected || typeof selected !== "string") return;

    if (isVideoBackgroundPath(selected)) {
      try {
        const storedPath = await invoke<string>("save_background_image", {
          sourcePath: selected,
        });

        setThemeSettings((prev) => ({
          ...prev,
          backgroundImagePath: `${storedPath}?t=${Date.now()}`,
        }));
      } catch (error) {
        console.error("Failed to save background video:", error);
        const message = error instanceof Error ? error.message : String(error);
        window.alert(`Failed to apply background video: ${message}`);
      }

      return;
    }
    
    setOriginalPath(selected);
    setImageToCrop(convertFileSrc(selected));
  };

  const handleCloseCropModal = () => {
    cropRequestVersionRef.current += 1;
    setImageToCrop(null);
    setOriginalPath(null);
  };

  const handleCropComplete = async (cropData: any) => {
    if (!originalPath) return;

    const requestVersion = cropRequestVersionRef.current + 1;
    cropRequestVersionRef.current = requestVersion;

    try {
      const timeoutMs = 30000;
      const storedPath = await Promise.race([
        invoke<string>("crop_and_save_image", {
          sourcePath: originalPath,
          crop: {
            x: cropData.x,
            y: cropData.y,
            width: cropData.width,
            height: cropData.height,
            rotation: cropData.rotation,
            flip_h: cropData.flip.horizontal,
            flip_v: cropData.flip.vertical,
          }
        }),
        new Promise<string>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Image apply timed out. Please try a smaller image."));
          }, timeoutMs);
        }),
      ]);

      if (cropRequestVersionRef.current !== requestVersion) {
        return;
      }

      setThemeSettings((prev) => ({
        ...prev,
        backgroundImagePath: `${storedPath}?t=${Date.now()}`,
      }));
      setImageToCrop(null);
      setOriginalPath(null);
    } catch (error) {
      console.error("Failed to crop and save image:", error);
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Failed to apply background image: ${message}`);
    }
  };

  return (
    <section className="panel menu-panel settings-panel">
      <h3>Appearance</h3>
      <div className="about-content">

        <SettingsSection title="Colors" description="The accent and gradient that tint the whole app." defaultOpen>
        <SettingRow
          label="Accent color"
          description="The main color for buttons, highlights, and icons."
          control={
            <div className="settings-control">
              <ColorPicker
                color={themeSettings.accentColor}
                presets={ACCENT_PRESET_COLORS}
                onChange={(newColor) => {
                  setThemeSettings((prev) => {
                    const preset = findAccentPreset(newColor);
                    // a preset carries its own gradient, so apply the pair.
                    // custom colours only move the gradient while it is still
                    // app-chosen, so a hand-picked one is never overwritten.
                    const nextGradient = preset
                      ? preset.gradient
                      : isPresetGradient(prev.backgroundGradientColor) ||
                          prev.backgroundGradientColor === getDarkerColor(prev.accentColor)
                        ? getDarkerColor(newColor)
                        : prev.backgroundGradientColor;

                    return {
                      ...prev,
                      accentColor: newColor,
                      backgroundGradientColor: nextGradient,
                    };
                  });
                }}
              />
              <span className="settings-value">
                {themeSettings.accentColor.toUpperCase()}
              </span>
            </div>
          }
        />
        <SettingRow
          label="Background Gradient"
          description="The second color in the background gradient."
          control={
            <div className="settings-control">
              <ColorPicker
                color={themeSettings.backgroundGradientColor}
                presets={GRADIENT_PRESET_COLORS}
                onChange={(newColor) =>
                  setThemeSettings((prev) => ({
                    ...prev,
                    backgroundGradientColor: newColor,
                  }))
                }
              />
              <span className="settings-value">
                {themeSettings.backgroundGradientColor.toUpperCase()}
              </span>
            </div>
          }
        />
        </SettingsSection>

        <SettingsSection title="Background" description="Custom image, video, or effect behind everything.">
        <SettingRow
          label="Background media"
          description="Use your own image, GIF, or video as the background."
          control={
          <div className="settings-control">
            <button className="buttons" type="button" onClick={handlePickBackgroundMedia}>
              {themeSettings.backgroundImagePath ? "Change" : "Upload"}
            </button>
            <button
              className="buttons"
              type="button"
              onClick={() =>
                setThemeSettings((prev) => ({ ...prev, backgroundImagePath: null }))
              }
              disabled={!themeSettings.backgroundImagePath}
            >
              Clear
            </button>
          </div>
          }
        />
        
        <SettingRow
          label="Background opacity"
          description="How see-through the background is."
          control={
          <div className="settings-control">
            <input
              id={bgOpacityId}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={themeSettings.backgroundOpacity}
              onChange={(e) =>
                setThemeSettings((prev) => ({
                  ...prev,
                  backgroundOpacity: parseFloat(e.target.value),
                }))
              }
            />
            <span className="settings-value">
              {Math.round(themeSettings.backgroundOpacity * 100)}%
            </span>
          </div>
          }
        />

        <SettingRow
          label="Background blur"
          description="How blurry the background is."
          control={
            <div className="settings-control">
              <input
                id={bgBlurId}
                type="range"
                min="0"
                max="100"
                step="1"
                value={themeSettings.backgroundBlur}
                onChange={(e) =>
                  setThemeSettings((prev) => ({
                    ...prev,
                    backgroundBlur: parseInt(e.target.value),
                  }))
                }
              />
              <span className="settings-value">{themeSettings.backgroundBlur}px</span>
            </div>
          }
        />
        </SettingsSection>

        <SettingsSection title="Clip Tiles" description="How clips look in the grid.">
        <SettingRow
          label="Grid preview speed"
          description="How fast previews play in the grid."
          control={
            <div className="settings-control">
              <input
                id={gridPreviewSpeedId}
                type="range"
                min="0.25"
                max="3"
                step="0.05"
                value={themeSettings.gridPreviewSpeed ?? 1}
                onChange={(e) =>
                  setThemeSettings((prev) => ({
                    ...prev,
                    gridPreviewSpeed: parseFloat(e.target.value),
                  }))
                }
              />
              <span className="settings-value">{(themeSettings.gridPreviewSpeed ?? 1).toFixed(2)}x</span>
            </div>
          }
        />

        <SettingRow
          label="Show download button"
          description="Show a download button on each clip."
          control={
            <div className="settings-control">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={themeSettings.showDownloadButton}
                  onChange={(e) =>
                    setThemeSettings((prev) => ({
                      ...prev,
                      showDownloadButton: e.target.checked,
                    }))
                  }
                />
                <span className="checkmark"></span>
              </label>
            </div>
          }
        />

        <SettingRow
          label="Show clip timestamps"
          description="Show timestamps on each clip."
          control={
            <div className="settings-control">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={themeSettings.showClipTimestamps}
                  onChange={(e) =>
                    setThemeSettings((prev) => ({
                      ...prev,
                      showClipTimestamps: e.target.checked,
                    }))
                  }
                />
                <span className="checkmark"></span>
              </label>
            </div>
          }
        />

        <SettingRow
          label="Widescreen clip tiles"
          description="Show clip tiles as square or widescreen."
          control={
            <div className="settings-control">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={themeSettings.widescreenClipTiles ?? false}
                  onChange={(e) =>
                    setThemeSettings((prev) => ({
                      ...prev,
                      widescreenClipTiles: e.target.checked,
                    }))
                  }
                />
                <span className="checkmark"></span>
              </label>
            </div>
          }
        />
        </SettingsSection>
        <SettingRow
          label="Factory Reset"
          description="Puts every Appearance setting back to its default."
          control={
            <div className="settings-control">
              <button
                className="buttons emergency"
                onClick={onThemeReset}
                style={{ width: "auto", padding: "0 16px", marginBottom: 0, color: "red"}}
              >
                Reset to Defaults
              </button>
            </div>
          }
        />

        {imageToCrop && (
          <CropModal
            image={imageToCrop}
            onClose={handleCloseCropModal}
            onCropComplete={handleCropComplete}
          />
        )}
      </div>
    </section>
  );
}
