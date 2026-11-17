import { useTranslation } from "react-i18next";
import Dropdown, { type DropdownOption } from "../../common/Dropdown";
import { resolveLanguage, useLanguageStore, type LanguagePreference } from "../../../i18n";

/** Settings > General language choice; takes effect at once, no save step */
export default function LanguagePicker() {
  const { t } = useTranslation("common");
  const preference = useLanguageStore((s) => s.preference);
  const setPreference = useLanguageStore((s) => s.setPreference);
  const systemLanguage = resolveLanguage("system");

  const options: DropdownOption<LanguagePreference>[] = [
    {
      value: "system",
      label: t("language.system"),
      description: t("language.systemResolved", { language: t(`language.${systemLanguage}`) }),
    },
    { value: "en", label: t("language.en") },
    { value: "zh-CN", label: t("language.zh-CN") },
    { value: "fr-FR", label: t("language.fr-FR") },
  ];

  return (
    <Dropdown
      className="settings-wide-dropdown"
      options={options}
      value={preference}
      onChange={setPreference}
      showTriggerDescription={false}
    />
  );
}
