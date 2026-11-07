import Dropdown from "../../common/Dropdown";
import SettingRow from "../../common/SettingRow";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
import { useAiDepsStore } from "../../../stores/aiDepsStore";
import { isPackInstalled, type AiPackId } from "../../../features/aiDeps/packs";
import { useFeature } from "../../../features/featureToggles";
import {
  DEPTH_COLORMAP_OPTIONS,
  DEPTH_ENCODER_OPTIONS,
  UPSCALE_MODEL_OPTIONS,
  UPSCALE_QUALITY_OPTIONS,
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
  const passes = useGeneralSettingsStore((s) => s.postExportPasses);
  const update = useGeneralSettingsStore((s) => s.updatePostExportPasses);
  const { depth, upscale } = passes;
  // each pass is a feature in Settings > Features: off greys its switch, hidden leaves it out
  const depthFeature = useFeature("depthPass");
  const upscaleFeature = useFeature("upscalePass");
  const OFF_NOTE = " Turn it on in Settings › Features.";

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
      {!depthFeature.hidden && (
        <SettingRow
          label="Depth map pass"
          description={`Also save a depth map of each export as <name>_depth.${depthFeature.enabled ? "" : OFF_NOTE}`}
          control={
            <ToggleControl
              label="Toggle depth map pass"
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
            label="Depth model"
            description="Bigger models look better but take longer."
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={DEPTH_ENCODER_OPTIONS}
                value={depth.encoder}
                onChange={(encoder) => update("depth", { encoder: encoder as DepthEncoder })}
              />
            }
          />
          <SettingRow
            label="Colormap"
            description="Color palette for the depth map."
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
            label="Grayscale"
            description="Use black and white instead of a color palette."
            control={
              <ToggleControl
                label="Toggle grayscale depth"
                checked={depth.grayscale}
                onChange={(grayscale) => update("depth", { grayscale })}
              />
            }
          />
        </div>
      )}
      {!upscaleFeature.hidden && (
        <SettingRow
          label="Upscale pass"
          description={`Also save a higher resolution copy of each export as <name>_upscaled.${upscaleFeature.enabled ? "" : OFF_NOTE}`}
          control={
            <ToggleControl
              label="Toggle upscale pass"
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
            label="Upscale model"
            description="All are trained on anime. Downloads the first time you use it."
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={UPSCALE_MODEL_OPTIONS}
                value={upscale.model}
                onChange={(model) => update("upscale", { model: model as UpscaleModel })}
              />
            }
          />
          <SettingRow
            label="File quality"
            description="How the upscaled video is compressed. Outputs are always H.264."
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={UPSCALE_QUALITY_OPTIONS}
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
