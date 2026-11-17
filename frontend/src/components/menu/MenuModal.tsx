import { useTranslation } from "react-i18next";
import Menu from "../../pages/Menu";
import ModalShell from "../common/ModalShell";
import { useUIStateStore } from "../../stores/UIStore";

export default function MenuModal() {
  const { t } = useTranslation("shell");
  const open = useUIStateStore((s) => s.menuOpen);
  const closeMenu = useUIStateStore((s) => s.closeMenu);

  return (
    <ModalShell open={open} onClose={closeMenu} label={t("menuPage.label")}>
      <Menu />
    </ModalShell>
  );
}
