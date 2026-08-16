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
            "This codec can only be encoded on the CPU."
          ) : (
            <>
              {!gpuProbeComplete
                ? "Detecting hardware encoders..."
                : gpuReadyForCodec
                  ? `Using your ${gpuCapabilities.preferredBackend} GPU${
                      selectedGpuEncoder ? ` (${selectedGpuEncoder})` : ""
                    }. Auto falls back to the CPU if it fails.`
                  : gpuCapabilities.hasGpuEncoder
                    ? "Your GPU can't encode this codec, so Auto uses the CPU."
                    : "No GPU encoder found, so Auto uses the CPU."}{" "}
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
            ? "Only available on GPUs that can run more than one encode at a time."
            : `How many exports run at the same time. This codec supports up to ${parallelLimit}.`
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