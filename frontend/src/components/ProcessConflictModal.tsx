import { useTranslation } from "react-i18next";

import { ConfirmModal } from "./settings/general/ConfirmModal";
import {
  answerConflict,
  processLabel,
  useProcessConflictStore,
} from "../features/processes/singleProcess";

/** asks before a second long job starts: stop the running one, or keep it (see singleProcess.ts) */
export default function ProcessConflictModal() {
  const { t } = useTranslation("jobs");
  const conflict = useProcessConflictStore((s) => s.conflict);
  const stopping = useProcessConflictStore((s) => s.stopping);
  if (!conflict) return null;

  return (
    <ConfirmModal
      title={t("process.conflictTitle")}
      message={
        <>
          {t("process.conflictRunning", { process: processLabel(conflict.running) })}
          <br />
          {stopping
            ? t("process.stoppingIt")
            : t("process.conflictQuestion", { process: processLabel(conflict.next) })}
        </>
      }
      confirmLabel={stopping ? t("process.stopping") : t("process.stopAndContinue")}
      cancelLabel={t("process.keepRunning")}
      busy={stopping}
      onConfirm={() => void answerConflict(true)}
      onClose={() => void answerConflict(false)}
    />
  );
}
