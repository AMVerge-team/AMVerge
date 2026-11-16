import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText, showNotice } from "../../features/notice/notice";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  getDarkerColor,
  isVideoBackgroundPath,
  JERSEY_FONT,
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
import FontPicker from "./FontPicker";
import SettingsSection from "../common/SettingsSection";

type AppearanceSectionProps = {
  onThemeReset: () => void;
};

export default function AppearanceSection({
  onThemeReset
}: AppearanceSectionProps) {
  const { t } = useTranslation("settings");
  const themeSettings = useThemeSettingsStore();
  const setThemeSettings = useThemeSettingsStore.setState;
  const bgOpacityId = useId();
  const bgBlurId = useId();
  const gridPreviewSpeedId = useId();
  const appFontAdjustId = useId();

  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [originalPath, setOriginalPath] = useState<string | null>(null);
  const cropRequestVersionRef = useRef(0);

  const handlePickBackgroundMedia = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: t("appearance.background.mediaFilter"),
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "bmp",
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
        void showNotice(
          t("appearance.background.notAppliedTitle"),
          t("appearance.background.videoFailed", { error: errorText(error) })
        );
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
            reject(new Error(t("appearance.background.imageTimeout")));
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
      void showNotice(
        t("appearance.background.notAppliedTitle"),
        t("appearance.background.imageFailed", { error: errorText(error) })
      );
    }
  };

  return (
    <section className="panel menu-panel settings-panel">
      <h3>{t("appearance.title")}</h3>
      <div className="about-content">

        <SettingsSection id="appearance.colors" title={t("appearance.colors.title")}>
        <SettingRow
          label={t("appearance.colors.accent.label")}
          description={t("appearance.colors.accent.description")}
          control={
            <div className="settings-control">
              <ColorPicker
                color={themeSettings.accentColor}
                presets={ACCENT_PRESET_COLORS}
                onChange={(newColor) => {
                  setThemeSettings((prev) => {
                    const preset = findAccentPreset(newColor);
                    // a preset applies its gradient; custom colours only move an app-chosen one
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
          label={t("appearance.colors.gradient.label")}
          description={t("appearance.colors.gradient.description")}
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

        <SettingsSection id="appearance.background" title={t("appearance.background.title")}>
        <SettingRow
          label={t("appearance.background.media.label")}
          description={t("appearance.background.media.description")}
          control={
          <div className="settings-control">
            <button className="buttons" type="button" onClick={handlePickBackgroundMedia}>
              {themeSettings.backgroundImagePath ? t("appearance.background.media.change") : t("appearance.background.media.upload")}
            </button>
            <button
              className="buttons"
              type="button"
              onClick={() =>
                setThemeSettings((prev) => ({ ...prev, backgroundImagePath: null }))
              }
              disabled={!themeSettings.backgroundImagePath}
            >
              {t("appearance.background.media.clear")}
            </button>
          </div>
          }
        />
        
        <SettingRow
          label={t("appearance.background.opacity.label")}
          description={t("appearance.background.opacity.description")}
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
          label={t("appearance.background.blur.label")}
          description={t("appearance.background.blur.description")}
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

        <SettingsSection id="appearance.text" title={t("appearance.text.title")}>
          <SettingRow
            label={t("appearance.text.font.label")}
            description={t("appearance.text.font.description")}
            control={<FontPicker />}
          />

          <SettingRow
            label={t("appearance.text.size.label")}
            description={t("appearance.text.size.description")}
            control={
              <div className="settings-control">
                <input
                  id={appFontAdjustId}
                  type="range"
                  min="0.35"
                  max="0.6"
                  step="0.01"
                  value={themeSettings.appFontAdjust ?? 0.47}
                  disabled={themeSettings.appFontFamily === JERSEY_FONT}
                  onChange={(e) =>
                    setThemeSettings((prev) => ({
                      ...prev,
                      appFontAdjust: parseFloat(e.target.value),
                    }))
                  }
                />
                <span className="settings-value">
                  {Math.round(((themeSettings.appFontAdjust ?? 0.47) / 0.47) * 100)}%
                </span>
              </div>
            }
          />
        </SettingsSection>

        <SettingsSection id="appearance.clipTiles" title={t("appearance.clipTiles.title")}>
        <SettingRow
          label={t("appearance.clipTiles.previewSpeed.label")}
          description={t("appearance.clipTiles.previewSpeed.description")}
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
          label={t("appearance.clipTiles.downloadButton.label")}
          description={t("appearance.clipTiles.downloadButton.description")}
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
          label={t("appearance.clipTiles.timestamps.label")}
          description={t("appearance.clipTiles.timestamps.description")}
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
          label={t("appearance.clipTiles.endTime.label")}
          description={t("appearance.clipTiles.endTime.description")}
          control={
            <div className="settings-control">
              <label className="custom-checkbox">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={themeSettings.showClipEndTime ?? false}
                  disabled={!themeSettings.showClipTimestamps}
                  onChange={(e) =>
                    setThemeSettings((prev) => ({
                      ...prev,
                      showClipEndTime: e.target.checked,
                    }))
                  }
                />
                <span className="checkmark"></span>
              </label>
            </div>
          }
        />

        <SettingRow
          label={t("appearance.clipTiles.widescreen.label")}
          description={t("appearance.clipTiles.widescreen.description")}
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
          label={t("appearance.reset.label")}
          description={t("appearance.reset.description")}
          control={
            <div className="settings-control">
              <button
                className="buttons emergency"
                onClick={onThemeReset}
                style={{ width: "auto", padding: "0 16px", marginBottom: 0, color: "red"}}
              >
                {t("resetToDefaults")}
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
