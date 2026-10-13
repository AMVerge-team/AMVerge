import { ConfirmModal } from "./settings/general/ConfirmModal";
import {
  answerConflict,
  PROCESS_LABELS,
  useProcessConflictStore,
} from "../features/processes/singleProcess";

/** asks before a second long job starts: stop the running one, or keep it (see singleProcess.ts) */
export default function ProcessConflictModal() {
  const conflict = useProcessConflictStore((s) => s.conflict);
  const stopping = useProcessConflictStore((s) => s.stopping);
  if (!conflict) return null;

  return (
    <ConfirmModal
      title="Another process is running"
      message={
        <>
          AMVerge is {PROCESS_LABELS[conflict.running]}. Only one process runs at a time.
          <br />
          {stopping
            ? "Stopping it…"
            : `Stop it and start ${PROCESS_LABELS[conflict.next]} instead?`}
        </>
      }
      confirmLabel={stopping ? "Stopping…" : "Stop it and continue"}
      cancelLabel="Keep it running"
      busy={stopping}
      onConfirm={() => void answerConflict(true)}
      onClose={() => void answerConflict(false)}
    />
  );
}
