import { useTranslation } from "react-i18next";

/** an accent-coloured ring for content that is still being prepared */
export default function LoadingSpinner({ label }: { label?: string }) {
  const { t } = useTranslation("shell");
  return <span className="loading-spinner" role="status" aria-label={label ?? t("common:loading")} />;
}
