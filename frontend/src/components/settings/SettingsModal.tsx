import Settings from "../../pages/Settings";
import ModalShell from "../common/ModalShell";
import { useUIStateStore } from "../../stores/UIStore";

type SettingsModalProps = {
  onGeneralSettingsReset: () => void;
  onEpisodesPathChanged: (oldPath: string, newPath: string) => void;
  onThemeReset: () => void;
};

export default function SettingsModal(props: SettingsModalProps) {
  const open = useUIStateStore((s) => s.settingsOpen);
  const closeSettings = useUIStateStore((s) => s.closeSettings);

  return (
    <ModalShell open={open} onClose={closeSettings} label="Settings">
      <Settings {...props} />
    </ModalShell>
  );
}
