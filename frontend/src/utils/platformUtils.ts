export function getFileManagerName(): string {
  if (typeof navigator === "undefined") return "File Explorer";
  if (/mac/i.test(navigator.userAgent)) return "Finder";
  if (/linux/i.test(navigator.userAgent)) return "File Manager";
  return "File Explorer";
}

export function getRevealInFileManagerLabel(): string {
  return `Show in ${getFileManagerName()}`;
}
