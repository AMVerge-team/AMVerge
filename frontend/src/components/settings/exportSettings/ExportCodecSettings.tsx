import { useTranslation } from "react-i18next";
import Dropdown from "../../common/Dropdown";
import SettingRow from "../../common/SettingRow";
import {
  EXPORT_CODEC_FAMILY_OPTIONS,
  getCodecFamily,
  getExportAudioOptions,
  getCodecOptionsForFamily,
  type ExportCodecFamily,
  type ExportProfile,
} from "../../../features/export/profiles";

type ExportCodecSettingsProps = {
  activeProfile: ExportProfile;
  showCodecSettings: boolean;
  showAudioSetting: boolean;
  updateActiveProfile: (changes: Partial<ExportProfile>) => void;
};

export default function ExportCodecSettings({
  activeProfile,
  showCodecSettings,
  showAudioSetting,
  updateActiveProfile,
}: ExportCodecSettingsProps) {
  const { t } = useTranslation("settingsExport");
  const codecFamily = getCodecFamily(activeProfile.codec);
  const codecProfileOptions = getCodecOptionsForFamily(codecFamily);

  const handleCodecFamilyChange = (family: ExportCodecFamily) => {
    const options = getCodecOptionsForFamily(family);
    const nextCodec = options[0]?.value ?? activeProfile.codec;

    updateActiveProfile({ codec: nextCodec });
  };

  return (
    <>
      {showCodecSettings && (
        <>
          <SettingRow
            label={t("codec.label")}
            description={t("codec.description")}
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={EXPORT_CODEC_FAMILY_OPTIONS}
                value={codecFamily}
                onChange={handleCodecFamilyChange}
              />
            }
          />

          <SettingRow
            label={t("codec.profile.label")}
            description={t("codec.profile.description")}
            control={
              <Dropdown
                className="settings-wide-dropdown"
                options={codecProfileOptions}
                value={activeProfile.codec}
                onChange={(codec) => updateActiveProfile({ codec })}
              />
            }
          />
        </>
      )}

      {showAudioSetting && (
        <SettingRow
          label={t("audio.label")}
          description={t("audio.description")}
          control={
            <Dropdown
              className="settings-wide-dropdown"
              options={getExportAudioOptions()}
              value={activeProfile.audioMode}
              onChange={(audioMode) => updateActiveProfile({ audioMode })}
            />
          }
        />
      )}
    </>
  );
}