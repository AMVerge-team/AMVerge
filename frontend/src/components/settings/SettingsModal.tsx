import { useTranslation } from "react-i18next";
import Settings from "../../pages/Settings";
import ModalShell from "../common/ModalShell";
import { useUIStateStore } from "../../stores/UIStore";

type SettingsModalProps = {
  onGeneralSettingsReset: () => void;
  onThemeReset: () => void;
};

export default function SettingsModal(props: SettingsModalProps) {
  const { t } = useTranslation("shell");
  const open = useUIStateStore((s) => s.settingsOpen);
  const closeSettings = useUIStateStore((s) => s.closeSettings);

  return (
    <ModalShell open={open} onClose={closeSettings} label={t("settingsPage.title")} className="settings-modal">
      <Settings {...props} />
    </ModalShell>
  );
}
