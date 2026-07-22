import Dropdown from "../../common/Dropdown";
import SettingRow from "../../common/SettingRow";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
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

  return (
    <>
      <SettingRow
        label="Depth map pass"
        description="After export, also render a Depth-Anything-V2 depth map of each output as <name>_depth."
        control={
          <ToggleControl
            label="Toggle depth map pass"
            checked={depth.enabled}
            onChange={(enabled) => update("depth", { enabled })}
          />
        }
      />
      {depth.enabled && (
        <div className="pass-config">
          <SettingRow
            label="Depth model"
            description="Larger = more detail, slower."
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
            description="Color palette for the depth output."
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
            description="Output a grayscale depth map instead of a color palette."
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
        label="Dead frames pass"
        description="After export, also remove dead (static) frames from each output as <name>_deadframes."
        control={
          <ToggleControl
            label="Toggle dead frames pass"
            checked={deadframes.enabled}
            onChange={(enabled) => update("deadframes", { enabled })}
          />
        }
      />
      {deadframes.enabled && (
        <div className="pass-config">
          <SettingRow
            label="Auto-calibrate"
            description="Auto-tune thresholds from the frame-pair distribution."
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
            description="Preserve subtle dialogue / mouth movement."
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
            description="Preserve camera pan / zoom / shake."
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
            description="Only drop completely static frames (keep talking + camera)."
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
            description="Minimum consecutive dead frames before dropping (preserves animation holds)."
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

      <SettingRow
        label="Interpolation pass"
        description="After export, remove dead frames then interpolate each output as <name>_interpolated (intermediate not kept)."
        control={
          <ToggleControl
            label="Toggle interpolation pass"
            checked={interpolation.enabled}
            onChange={(enabled) => update("interpolation", { enabled })}
          />
        }
      />
      {interpolation.enabled && (
        <div className="pass-config">
          <SettingRow
            label="Interpolation model"
            description="RIFE frame-interpolation model."
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
            description="Frame-rate multiplier applied on top of the deadframes result."
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={INTERPOLATION_FACTOR_OPTIONS}
                value={interpolation.factor}
                onChange={(factor) => update("interpolation", { factor: Number(factor) })}
              />
            }
          />
        </div>
      )}
    </>
  );
}
