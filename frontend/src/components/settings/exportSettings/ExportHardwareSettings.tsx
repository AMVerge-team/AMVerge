import Dropdown from "../../common/Dropdown";
import SettingRow from "../../common/SettingRow";
import {
  EXPORT_HARDWARE_OPTIONS,
  NVIDIA_ENCODER_SUPPORT_MATRIX_URL,
  type ExportProfile,
  type GpuEncoderCapabilities,
  type NvidiaDetectionResult,
} from "../../../features/export/profiles";

type ExportHardwareSettingsProps = {
  activeProfile: ExportProfile;
  nvidiaDetection: NvidiaDetectionResult;
  gpuCapabilities: GpuEncoderCapabilities;
  gpuProbeComplete: boolean;
  selectedGpuEncoder: string | null;
  gpuReadyForCodec: boolean;
  encoderLockedToCpu: boolean;
  parallelLocked: boolean;
  parallelLimit: number;
  effectiveParallelExports: number;
  parallelExportOptions: {
    value: number;
    label: string;
  }[];
  updateActiveProfile: (changes: Partial<ExportProfile>) => void;
};

export default function ExportHardwareSettings({
  activeProfile,
  nvidiaDetection,
  gpuCapabilities,
  gpuProbeComplete,
  selectedGpuEncoder,
  gpuReadyForCodec,
  encoderLockedToCpu,
  parallelLocked,
  parallelLimit,
  effectiveParallelExports,
  parallelExportOptions,
  updateActiveProfile,
}: ExportHardwareSettingsProps) {
  return (
    <>
      <SettingRow
        label="Video Encoder"
        description={
          encoderLockedToCpu ? (
            "Selected codec is CPU-only, with no GPU encoder path."
          ) : (
            <>
              {!gpuProbeComplete
                ? "Detecting hardware encoders..."
                : gpuReadyForCodec
                  ? `Detected GPU backend: ${gpuCapabilities.preferredBackend}${
                      selectedGpuEncoder ? ` (${selectedGpuEncoder})` : ""
                    }. Auto mode uses GPU and falls back to CPU on failure.`
                  : gpuCapabilities.hasGpuEncoder
                    ? "No compatible GPU encoder for selected codec on this machine. Auto mode falls back to CPU."
                    : "No compatible GPU encoder detected. Auto mode falls back to CPU."}{" "}
              {nvidiaDetection.hasNvidiaGpu ? (
                <a
                  href={NVIDIA_ENCODER_SUPPORT_MATRIX_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  NVIDIA matrix
                </a>
              ) : null}
            </>
          )
        }
        control={
          <Dropdown
            className="settings-wide-dropdown"
            options={EXPORT_HARDWARE_OPTIONS}
            value={encoderLockedToCpu ? "cpu" : activeProfile.hardwareMode}
            onChange={(hardwareMode) => updateActiveProfile({ hardwareMode })}
            disabled={encoderLockedToCpu}
          />
        }
      />

      <SettingRow
        label="Parallel Encodes"
        description={
          parallelLocked
            ? "Enabled only when selected GPU backend supports parallel sessions. Non-NVIDIA backends stay single-worker."
            : `Detected limit: up to ${parallelLimit} parallel exports for this codec. This option sets how many exports run at the same time.`
        }
        control={
          <Dropdown
            className="settings-wide-dropdown"
            options={parallelExportOptions}
            value={effectiveParallelExports}
            onChange={(parallelExports) => updateActiveProfile({ parallelExports })}
            disabled={parallelLocked}
          />
        }
      />
    </>
  );
}