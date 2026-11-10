import { ConfirmModal } from "./settings/general/ConfirmModal";
import { answerNotice, useNoticeStore } from "../features/notice/notice";

/** shows queued notices one at a time, in the app's own modal instead of an os box */
export function AppNotice() {
  const notice = useNoticeStore((s) => s.queue[0]);
  if (!notice) return null;

  const question = notice.confirmLabel !== undefined;
  return (
    <ConfirmModal
      key={notice.id}
      title={notice.title}
      message={<span className="app-notice-message">{notice.message}</span>}
      confirmLabel={notice.confirmLabel ?? "OK"}
      cancelLabel={question ? "Cancel" : null}
      onConfirm={() => answerNotice(notice.id, true)}
      onClose={() => answerNotice(notice.id, false)}
    />
  );
}

export default AppNotice;
