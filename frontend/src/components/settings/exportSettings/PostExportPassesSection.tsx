import Dropdown from "../../common/Dropdown";
import SettingRow from "../../common/SettingRow";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
import { useAiDepsStore } from "../../../stores/aiDepsStore";
import { isPackInstalled, type AiPackId } from "../../../features/aiDeps/packs";
import { useFeature } from "../../../features/featureToggles";
import {
  DEPTH_COLORMAP_OPTIONS,
  DEPTH_ENCODER_OPTIONS,
  type DepthColormap,
  type DepthEncoder,
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
  const { depth } = passes;
  // each pass is a feature in Settings > Features: off greys its switch, hidden leaves it out
  const depthFeature = useFeature("depthPass");
  const OFF_NOTE = " Turn it on in Settings › Features.";

  const aiStatus = useAiDepsStore((s) => s.status);

  const enableGatedPass = async (packId: AiPackId, enabled: boolean) => {
    if (enabled && !isPackInstalled(aiStatus, packId)) {
      const installed = await useAiDepsStore.getState().ensurePack(packId);
      if (!installed) return;
    }
    update("depth", { enabled });
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
    </>
  );
}
