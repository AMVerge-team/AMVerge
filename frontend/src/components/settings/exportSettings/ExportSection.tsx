import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Dropdown from "../../common/Dropdown";
import SettingRow from "../../common/SettingRow";
import { useGeneralSettingsStore } from "../../../stores/settingsStore";
import {
  EXPORT_CONTAINER_OPTIONS,
  getExportWorkflowOptions,
  getActiveExportProfile,
  getCodecFamily,
  getExportProfileSummary,
  getParallelExportLimit,
  isCodecGpuEligible,
  normalizeExportProfile,
  supportsAudioMode,
  supportsContainerSelection,
  usesEncoding,
  type ExportProfile,
  type ExportWorkflow,
  type GpuEncoderCapabilities,
  type NvidiaEncoderProfile,
} from "../../../features/export/profiles";
import { renderProfileIcon } from "../../../features/export/profileIconUtils";
import useGpuEncoderDetection from "./hooks/useGpuEncoderDetection";
import ProfileActions from "./ProfileActions";
import ProfileIconPicker from "./ProfileIconPicker";
import ExportCodecSettings from "./ExportCodecSettings";
import ExportHardwareSettings from "./ExportHardwareSettings";
import PostExportPassesSection from "./PostExportPassesSection";
import SettingsSection from "../../common/SettingsSection";
import { useFeature } from "../../../features/featureToggles";

function resolveGpuEncoderForCodec(
  codec: ExportProfile["codec"],
  capabilities: GpuEncoderCapabilities
): string | null {
  if (codec === "av1_main" || codec === "av1") return capabilities.av1Encoder;

  const family = getCodecFamily(codec);

  if (family === "h264") return capabilities.h264Encoder;
  if (family === "h265") return capabilities.h265Encoder;

  return null;
}

export default function ExportSection() {
  const { t } = useTranslation("settingsExport");
  const exportProfiles = useGeneralSettingsStore((state) => state.exportProfiles);
  const activeExportProfileId = useGeneralSettingsStore((state) => state.activeExportProfileId);
  const setActiveExportProfileId = useGeneralSettingsStore((state) => state.setActiveExportProfileId);
  const addExportProfile = useGeneralSettingsStore((state) => state.addExportProfile);
  const deleteExportProfile = useGeneralSettingsStore((state) => state.deleteExportProfile);
  const updateExportProfile = useGeneralSettingsStore((state) => state.updateExportProfile);
  const customProfileIcons = useGeneralSettingsStore((state) => state.customProfileIcons);
  const addCustomProfileIcon = useGeneralSettingsStore((state) => state.addCustomProfileIcon);
  const removeCustomProfileIcon = useGeneralSettingsStore((state) => state.removeCustomProfileIcon);
  const openFileLocationAfterExport = useGeneralSettingsStore(
    (state) => state.openFileLocationAfterExport
  );
  const setOpenFileLocationAfterExport = useGeneralSettingsStore(
    (state) => state.setOpenFileLocationAfterExport
  );

  // with both passes hidden the section would be an empty header
  const depthFeature = useFeature("depthPass");
  const upscaleFeature = useFeature("upscalePass");
  const passesHidden = depthFeature.hidden && upscaleFeature.hidden;

  const {
    nvidiaDetection,
    gpuCapabilities,
    gpuProbeComplete,
  } = useGpuEncoderDetection();

  const activeProfile = useMemo(
    () => getActiveExportProfile(exportProfiles, activeExportProfileId),
    [exportProfiles, activeExportProfileId]
  );

  const profileOptions = useMemo(
    () =>
      exportProfiles.map((profile) => ({
        value: profile.id,
        label: profile.name.trim() || t("profile.untitled"),
        description: getExportProfileSummary(profile).replace(/ • /g, " / "),
        icon: renderProfileIcon(profile),
      })),
    // t changes with the language, so summaries re-translate on switch
    [exportProfiles, t]
  );

  const encodingWorkflow = usesEncoding(activeProfile.workflow);
  const showAudioSetting = supportsAudioMode(activeProfile.workflow);
  const showContainerSetting = supportsContainerSelection(activeProfile.workflow);

  const codecGpuEligible = isCodecGpuEligible(activeProfile.codec);
  const selectedGpuEncoder = resolveGpuEncoderForCodec(activeProfile.codec, gpuCapabilities);
  const gpuReadyForCodec = Boolean(selectedGpuEncoder);
  const encoderLockedToCpu = encodingWorkflow && !codecGpuEligible;

  const nvidiaParallelLimit = getParallelExportLimit(activeProfile);
  const parallelLimit =
    !encodingWorkflow || activeProfile.hardwareMode === "cpu"
      ? 1
      : !codecGpuEligible || !gpuReadyForCodec
        ? 1
        : gpuCapabilities.preferredBackend === "nvidia"
          ? nvidiaParallelLimit
          : 1;

  const parallelLocked = parallelLimit <= 1;
  const effectiveParallelExports = Math.min(activeProfile.parallelExports, parallelLimit);

  const parallelExportOptions = useMemo(
    () =>
      Array.from({ length: parallelLimit }, (_, i) => {
        const value = parallelLimit - i;

        return {
          value,
          label:
            value === parallelLimit && parallelLimit > 1
              ? t("hardware.parallelMax", { count: value })
              : t("hardware.parallelCount", { count: value }),
        };
      }),
    [parallelLimit, t]
  );

  // syncs the encoder profile to the GPU probe and clamps parallel exports down when the limit shrinks, never up
  useEffect(() => {
    if (!gpuProbeComplete || !encodingWorkflow) return;

    const resolvedProfile: NvidiaEncoderProfile = nvidiaDetection.hasNvidiaGpu
      ? nvidiaDetection.profile
      : "unsupported";

    const detectedEncoderForCodec = resolveGpuEncoderForCodec(activeProfile.codec, gpuCapabilities);

    const nextParallelLimit =
      resolvedProfile !== "unsupported" &&
      gpuCapabilities.preferredBackend === "nvidia" &&
      Boolean(detectedEncoderForCodec) &&
      codecGpuEligible
        ? getParallelExportLimit({
            ...activeProfile,
            nvidiaEncoderProfile: resolvedProfile,
          })
        : 1;

    const clampedParallelExports = Math.max(
      1,
      Math.min(activeProfile.parallelExports, nextParallelLimit)
    );

    if (
      activeProfile.nvidiaEncoderProfile !== resolvedProfile ||
      clampedParallelExports !== activeProfile.parallelExports
    ) {
      updateExportProfile(activeProfile.id, {
        nvidiaEncoderProfile: resolvedProfile,
        parallelExports: clampedParallelExports,
      });
    }
  }, [
    activeProfile,
    activeProfile.id,
    activeProfile.nvidiaEncoderProfile,
    activeProfile.parallelExports,
    activeProfile.codec,
    codecGpuEligible,
    encodingWorkflow,
    gpuProbeComplete,
    gpuCapabilities,
    gpuCapabilities.preferredBackend,
    nvidiaDetection.hasNvidiaGpu,
    nvidiaDetection.profile,
    updateExportProfile,
  ]);

  // codecs that have no GPU encoder path (for example ProRes) must be CPU
  useEffect(() => {
    if (!encoderLockedToCpu) return;
    if (activeProfile.hardwareMode === "cpu") return;

    updateExportProfile(activeProfile.id, { hardwareMode: "cpu" });
  }, [activeProfile.hardwareMode, activeProfile.id, encoderLockedToCpu, updateExportProfile]);

  useEffect(() => {
    const normalized = normalizeExportProfile(activeProfile);

    if (
      normalized.parallelExports !== activeProfile.parallelExports ||
      normalized.hardwareMode !== activeProfile.hardwareMode ||
      normalized.editorTarget !== activeProfile.editorTarget ||
      normalized.codec !== activeProfile.codec ||
      normalized.nvidiaEncoderProfile !== activeProfile.nvidiaEncoderProfile
    ) {
      updateExportProfile(activeProfile.id, {
        parallelExports: normalized.parallelExports,
        hardwareMode: normalized.hardwareMode,
        editorTarget: normalized.editorTarget,
        codec: normalized.codec,
        nvidiaEncoderProfile: normalized.nvidiaEncoderProfile,
      });
    }
  }, [activeProfile, updateExportProfile]);

  const updateActiveProfile = (changes: Partial<ExportProfile>) => {
    updateExportProfile(activeProfile.id, changes);
  };

  const handleWorkflowChange = (workflow: ExportWorkflow) => {
    updateActiveProfile({
      workflow,
      hardwareMode: usesEncoding(workflow) ? activeProfile.hardwareMode : "cpu",
      parallelExports: usesEncoding(workflow) ? activeProfile.parallelExports : 1,
    });
  };

  return (
    <section className="panel menu-panel settings-panel export-settings-panel">
      <h3>{t("title")}</h3>

      <div className="about-content">
        <SettingsSection id="export.profile" title={t("profile.section")}>
        <SettingRow
          label={t("profile.active.label")}
          description={t("profile.active.description")}
          control={
            <Dropdown
              className="settings-wide-dropdown export-profile-dropdown"
              options={profileOptions}
              value={activeProfile.id}
              onChange={setActiveExportProfileId}
            />
          }
        />

        <ProfileActions
          canDelete={exportProfiles.length > 1}
          onAddProfile={addExportProfile}
          onDeleteProfile={() => deleteExportProfile(activeProfile.id)}
        />

        <SettingRow
          label={t("profile.name.label")}
          description={t("profile.name.description")}
          control={
            <input
              id="export-profile-name"
              className="settings-text-input"
              value={activeProfile.name}
              onChange={(event) => updateActiveProfile({ name: event.target.value })}
            />
          }
        />

        <SettingRow
          label={t("profile.icon.label")}
          description={t("profile.icon.description")}
          control={
            <ProfileIconPicker
              activeProfile={activeProfile}
              customProfileIcons={customProfileIcons}
              addCustomProfileIcon={addCustomProfileIcon}
              removeCustomProfileIcon={removeCustomProfileIcon}
              updateActiveProfile={updateActiveProfile}
            />
          }
        />
        </SettingsSection>

        <SettingsSection id="export.workflow" title={t("workflow.section")}>
        <SettingRow
          label={t("workflow.label")}
          description={t("workflow.description")}
          control={
            <Dropdown
              className="settings-wide-dropdown"
              options={getExportWorkflowOptions()}
              value={activeProfile.workflow}
              onChange={handleWorkflowChange}
            />
          }
        />

        <SettingRow
          label={t("openLocation.label")}
          description={t("openLocation.description")}
          control={
            <label className="custom-checkbox" aria-label={t("openLocation.toggle")}>
              <input
                type="checkbox"
                className="checkbox"
                checked={openFileLocationAfterExport}
                onChange={(event) => setOpenFileLocationAfterExport(event.target.checked)}
              />
              <span className="checkmark" />
            </label>
          }
        />

        {(encodingWorkflow || showAudioSetting) && (
          <ExportCodecSettings
            activeProfile={activeProfile}
            showCodecSettings={encodingWorkflow}
            showAudioSetting={showAudioSetting}
            updateActiveProfile={updateActiveProfile}
          />
        )}

        {encodingWorkflow && (
          <ExportHardwareSettings
            activeProfile={activeProfile}
            nvidiaDetection={nvidiaDetection}
            gpuCapabilities={gpuCapabilities}
            gpuProbeComplete={gpuProbeComplete}
            selectedGpuEncoder={selectedGpuEncoder}
            gpuReadyForCodec={gpuReadyForCodec}
            encoderLockedToCpu={encoderLockedToCpu}
            parallelLocked={parallelLocked}
            parallelLimit={parallelLimit}
            effectiveParallelExports={effectiveParallelExports}
            parallelExportOptions={parallelExportOptions}
            updateActiveProfile={updateActiveProfile}
          />
        )}

        {showContainerSetting && (
          <SettingRow
            label={t("container.label")}
            description={t("container.description")}
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={EXPORT_CONTAINER_OPTIONS}
                value={activeProfile.container}
                onChange={(container) => updateActiveProfile({ container })}
              />
            }
          />
        )}
        </SettingsSection>

        {!passesHidden && (
          <>
            <div className="settings-section-divider" />
            <SettingsSection id="export.postPasses" title={t("passes.section")}>
              <PostExportPassesSection />
            </SettingsSection>
          </>
        )}
      </div>
    </section>
  );
}
