import { useTranslation } from "react-i18next";
import { FaPlus, FaTrash } from '../../icons/animated';

type ProfileActionsProps = {
  canDelete: boolean;
  onAddProfile: () => void;
  onDeleteProfile: () => void;
};

export default function ProfileActions({
  canDelete,
  onAddProfile,
  onDeleteProfile,
}: ProfileActionsProps) {
  const { t } = useTranslation("settingsExport");
  return (
    <div className="export-profile-actions-row">
      <button
        type="button"
        className="buttons export-profile-action"
        onClick={onAddProfile}
      >
        <FaPlus />
        <span>{t("profile.new")}</span>
      </button>

      <button
        type="button"
        className="buttons export-profile-action danger"
        onClick={onDeleteProfile}
        disabled={!canDelete}
      >
        <FaTrash />
        <span>{t("profile.delete")}</span>
      </button>
    </div>
  );
}