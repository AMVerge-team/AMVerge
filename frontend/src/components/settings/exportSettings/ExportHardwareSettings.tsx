import { useTranslation } from "react-i18next";
import Dropdown from "../../common/Dropdown";
import SettingRow from "../../common/SettingRow";
import {
  getExportHardwareOptions,
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
  const { t } = useTranslation("settingsExport");
  return (
    <>
      <SettingRow
        label={t("hardware.encoder.label")}
        description={
          encoderLockedToCpu ? (
            t("hardware.encoder.cpuOnly")
          ) : (
            <>
              {!gpuProbeComplete
                ? t("hardware.encoder.detecting")
                : gpuReadyForCodec
                  ? selectedGpuEncoder
                    ? t("hardware.encoder.usingGpuWithEncoder", {
                        backend: gpuCapabilities.preferredBackend,
                        encoder: selectedGpuEncoder,
                      })
                    : t("hardware.encoder.usingGpu", { backend: gpuCapabilities.preferredBackend })
                  : gpuCapabilities.hasGpuEncoder
                    ? t("hardware.encoder.gpuUnsupported")
                    : t("hardware.encoder.noGpu")}{" "}
              {nvidiaDetection.hasNvidiaGpu ? (
                <a
                  href={NVIDIA_ENCODER_SUPPORT_MATRIX_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("hardware.encoder.nvidiaMatrix")}
                </a>
              ) : null}
            </>
          )
        }
        control={
          <Dropdown
            className="settings-wide-dropdown"
            options={getExportHardwareOptions()}
            value={encoderLockedToCpu ? "cpu" : activeProfile.hardwareMode}
            onChange={(hardwareMode) => updateActiveProfile({ hardwareMode })}
            disabled={encoderLockedToCpu}
          />
        }
      />

      <SettingRow
        label={t("hardware.parallel.label")}
        description={
          parallelLocked
            ? t("hardware.parallel.locked")
            : t("hardware.parallel.description", { count: parallelLimit })
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