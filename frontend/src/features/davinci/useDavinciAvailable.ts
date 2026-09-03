import { useEffect, useState } from "react";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { detectDavinciResolve } from "./resolveImport";

/**
 * whether the DaVinci Resolve export target may be offered: the feature is on in
 * Settings and Resolve is installed
 *
 * nothing on disk separates Resolve Free from Studio (same install path, same
 * executable metadata, same fusionscript.dll), so this gates on "installed": a
 * Free install fails at import time with the Studio requirement spelled out.
 */
export function useDavinciAvailable(): boolean {
  const enabled = useGeneralSettingsStore((s) => s.davinciResolveEnabled);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setInstalled(false);
      return;
    }
    let alive = true;
    void detectDavinciResolve().then((detection) => {
      if (alive) setInstalled(detection.installed);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return enabled && installed;
}
