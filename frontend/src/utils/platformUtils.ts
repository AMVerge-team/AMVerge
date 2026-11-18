import { t } from "../i18n";

export function getFileManagerName(): string {
  if (typeof navigator === "undefined") return t("common:fileManagers.explorer");
  if (/mac/i.test(navigator.userAgent)) return "Finder";
  if (/linux/i.test(navigator.userAgent)) return t("common:fileManagers.linux");
  return t("common:fileManagers.explorer");
}

export function getRevealInFileManagerLabel(): string {
  return t("common:showInFileManager", { manager: getFileManagerName() });
}
