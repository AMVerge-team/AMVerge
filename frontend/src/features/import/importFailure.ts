import { t } from "../../i18n";
import { errorText, showNotice } from "../notice/notice";

export function notifyImportFailure(error: unknown, file?: string, failedCount = 1) {
  const detail = errorText(error);
  const permissionDenied = /operation not permitted|permission denied|access is denied|os error (?:1|5|13)\b/i.test(detail);
  const hint = permissionDenied ? t("jobs:import.permissionHint") : t("jobs:import.failureHint");
  void showNotice(
    t("jobs:import.failedTitle", { count: failedCount }),
    [file, detail, hint].filter(Boolean).join("\n\n"),
  );
}
