import Dropdown from "../../common/Dropdown";
import SettingRow from "../../common/SettingRow";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
import { useAiDepsStore } from "../../../stores/aiDepsStore";
import { isPackInstalled, type AiPackId } from "../../../features/aiDeps/packs";
import {
  DEPTH_COLORMAP_OPTIONS,
  DEPTH_ENCODER_OPTIONS,
  INTERPOLATION_FACTOR_OPTIONS,
  INTERPOLATION_MODEL_OPTIONS,
  type DepthColormap,
  type DepthEncoder,
} from "../../../features/export/postPasses";

function ToggleControl({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="custom-checkbox" aria-label={label}>
      <input
        type="checkbox"
        className="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="checkmark" />
    </label>
  );
}

export default function PostExportPassesSection() {
  const passes = useGeneralSettingsStore((s) => s.postExportPasses);
  const update = useGeneralSettingsStore((s) => s.updatePostExportPasses);
  const { depth, deadframes, interpolation } = passes;

  // Depth and interpolation need torch (dead frames is opencv-only and ships
  // with the app). Offer the install when the pass is switched on, so the
  // dependency is in place long before an export runs.
  const aiStatus = useAiDepsStore((s) => s.status);

  const enableGatedPass = async (packId: AiPackId, enabled: boolean) => {
    if (enabled && !isPackInstalled(aiStatus, packId)) {
      const installed = await useAiDepsStore.getState().ensurePack(packId);
      if (!installed) return;
    }
    update(packId === "depth" ? "depth" : "interpolation", { enabled });
  };

  return (
    <>
      <SettingRow
        label="Depth map pass"
        description="Also save a depth map of each export as <name>_depth."
        control={
          <ToggleControl
            label="Toggle depth map pass"
            checked={depth.enabled}
            onChange={(enabled) => void enableGatedPass("depth", enabled)}
          />
        }
      />
      {depth.enabled && (
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

      <SettingRow
        label="Interpolation pass"
        description="Removes still frames, then adds new ones for smoother motion. Saved as <name>_interpolated."
        control={
          <ToggleControl
            label="Toggle interpolation pass"
            checked={interpolation.enabled}
            onChange={(enabled) => void enableGatedPass("interpolation", enabled)}
          />
        }
      />
      {interpolation.enabled && (
        <div className="pass-config">
          <SettingRow
            label="Interpolation model"
            description="Which RIFE model to use."
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={INTERPOLATION_MODEL_OPTIONS}
                value={interpolation.model}
                onChange={(model) => update("interpolation", { model })}
              />
            }
          />
          <SettingRow
            label="FPS multiplier"
            description="How much to multiply the frame rate by."
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={INTERPOLATION_FACTOR_OPTIONS}
                value={interpolation.factor}
                onChange={(factor) => update("interpolation", { factor: Number(factor) })}
              />
            }
          />
          <SettingRow
            label="Also export dead frames video"
            description="Save the still-frames-removed video too, as <name>_deadframes."
            control={
              <ToggleControl
                label="Toggle dead frames export"
                checked={deadframes.exportCopy}
                onChange={(exportCopy) => update("deadframes", { exportCopy })}
              />
            }
          />
          <p className="pass-subheading">Dead frame removal</p>
          <SettingRow
            label="Auto-calibrate"
            description="Work out the right settings for each video automatically."
            control={
              <ToggleControl
                label="Toggle deadframes auto"
                checked={deadframes.auto}
                onChange={(auto) => update("deadframes", { auto })}
              />
            }
          />
          <SettingRow
            label="Keep talking motion"
            description="Keep frames that only have small mouth movement."
            control={
              <ToggleControl
                label="Toggle keep talking"
                checked={deadframes.keepTalking}
                onChange={(keepTalking) => update("deadframes", { keepTalking })}
              />
            }
          />
          <SettingRow
            label="Keep camera motion"
            description="Keep frames that only have camera pan, zoom, or shake."
            control={
              <ToggleControl
                label="Toggle keep camera"
                checked={deadframes.keepCamera}
                onChange={(keepCamera) => update("deadframes", { keepCamera })}
              />
            }
          />
          <SettingRow
            label="Safe mode"
            description="Only remove frames that are completely still."
            control={
              <ToggleControl
                label="Toggle safe mode"
                checked={deadframes.safe}
                onChange={(safe) => update("deadframes", { safe })}
              />
            }
          />
          <SettingRow
            label="Cadence"
            description="How many still frames in a row before any are removed."
            control={
              <input
                type="number"
                className="settings-text-input pass-number-input"
                min={1}
                max={16}
                value={deadframes.cadence}
                onChange={(event) => {
                  const next = Math.max(1, Math.min(16, Number(event.target.value) || 1));
                  update("deadframes", { cadence: next });
                }}
              />
            }
          />
        </div>
      )}
    </>
  );
}
