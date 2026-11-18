import { useTranslation } from "react-i18next";
import Dropdown from "../../common/Dropdown";
import SettingRow from "../../common/SettingRow";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
import { useAiDepsStore } from "../../../stores/aiDepsStore";
import { isPackInstalled, type AiPackId } from "../../../features/aiDeps/packs";
import { useFeature } from "../../../features/featureToggles";
import {
  DEPTH_COLORMAP_OPTIONS,
  getDepthEncoderOptions,
  getUpscaleModelOptions,
  getUpscaleQualityOptions,
  type DepthColormap,
  type DepthEncoder,
  type PostExportPassKind,
  type UpscaleModel,
  type UpscaleQuality,
} from "../../../features/export/postPasses";

function ToggleControl({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="custom-checkbox" aria-label={label}>
      <input
        type="checkbox"
        className="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="checkmark" />
    </label>
  );
}

export default function PostExportPassesSection() {
  const { t } = useTranslation("settingsExport");
  const passes = useGeneralSettingsStore((s) => s.postExportPasses);
  const update = useGeneralSettingsStore((s) => s.updatePostExportPasses);
  const enabled = useGeneralSettingsStore((s) => s.postExportPassesEnabled);
  const setEnabled = useGeneralSettingsStore((s) => s.setPostExportPassesEnabled);
  const { depth, upscale } = passes;
  // each pass is a feature in Settings > Features: off greys its switch, hidden leaves it out
  const depthFeature = useFeature("depthPass");
  const upscaleFeature = useFeature("upscalePass");

  const aiStatus = useAiDepsStore((s) => s.status);

  const enableGatedPass = async (kind: PostExportPassKind & AiPackId, enabled: boolean) => {
    if (enabled && !isPackInstalled(aiStatus, kind)) {
      const installed = await useAiDepsStore.getState().ensurePack(kind);
      if (!installed) return;
    }
    update(kind, { enabled });
  };

  return (
    <>
      <SettingRow
        label={t("passes.master.label")}
        description={t("passes.master.description")}
        control={<ToggleControl label={t("passes.master.label")} checked={enabled} onChange={setEnabled} />}
      />
      {!depthFeature.hidden && (
        <SettingRow
          label={t("passes.depth.label")}
          description={
            depthFeature.enabled ? t("passes.depth.description") : t("passes.depth.descriptionOff")
          }
          control={
            <ToggleControl
              label={t("passes.depth.toggle")}
              checked={depth.enabled && depthFeature.enabled}
              disabled={!depthFeature.enabled}
              onChange={(enabled) => void enableGatedPass("depth", enabled)}
            />
          }
        />
      )}
      {depth.enabled && depthFeature.enabled && (
        <div className="pass-config">
          <SettingRow
            label={t("passes.depth.model.label")}
            description={t("passes.depth.model.description")}
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={getDepthEncoderOptions()}
                value={depth.encoder}
                onChange={(encoder) => update("depth", { encoder: encoder as DepthEncoder })}
              />
            }
          />
          <SettingRow
            label={t("passes.depth.colormap.label")}
            description={t("passes.depth.colormap.description")}
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={DEPTH_COLORMAP_OPTIONS}
                value={depth.colormap}
                onChange={(colormap) => update("depth", { colormap: colormap as DepthColormap })}
              />
            }
          />
          <SettingRow
            label={t("passes.depth.grayscale.label")}
            description={t("passes.depth.grayscale.description")}
            control={
              <ToggleControl
                label={t("passes.depth.grayscale.toggle")}
                checked={depth.grayscale}
                onChange={(grayscale) => update("depth", { grayscale })}
              />
            }
          />
        </div>
      )}
      {!upscaleFeature.hidden && (
        <SettingRow
          label={t("passes.upscale.label")}
          description={
            upscaleFeature.enabled ? t("passes.upscale.description") : t("passes.upscale.descriptionOff")
          }
          control={
            <ToggleControl
              label={t("passes.upscale.toggle")}
              checked={upscale.enabled && upscaleFeature.enabled}
              disabled={!upscaleFeature.enabled}
              onChange={(enabled) => void enableGatedPass("upscale", enabled)}
            />
          }
        />
      )}
      {upscale.enabled && upscaleFeature.enabled && (
        <div className="pass-config">
          <SettingRow
            label={t("passes.upscale.model.label")}
            description={t("passes.upscale.model.description")}
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={getUpscaleModelOptions()}
                value={upscale.model}
                onChange={(model) => update("upscale", { model: model as UpscaleModel })}
              />
            }
          />
          <SettingRow
            label={t("passes.upscale.quality.label")}
            description={t("passes.upscale.quality.description")}
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={getUpscaleQualityOptions()}
                value={upscale.quality}
                onChange={(quality) => update("upscale", { quality: quality as UpscaleQuality })}
              />
            }
          />
        </div>
      )}
    </>
  );
}
