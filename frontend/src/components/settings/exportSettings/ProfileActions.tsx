import { FaPlus, FaTrash } from "react-icons/fa";

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
  return (
    <div className="export-profile-actions-row">
      <button
        type="button"
        className="buttons export-profile-action"
        onClick={onAddProfile}
      >
        <FaPlus />
        <span>New Profile</span>
      </button>

      <button
        type="button"
        className="buttons export-profile-action danger"
        onClick={onDeleteProfile}
        disabled={!canDelete}
      >
        <FaTrash />
        <span>Delete Profile</span>
      </button>
    </div>
  );
}