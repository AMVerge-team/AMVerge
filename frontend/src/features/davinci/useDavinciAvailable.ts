import { useEffect, useState } from "react";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { detectDavinciResolve } from "./resolveImport";

/** whether to offer Resolve export: feature on and Resolve installed (Free and Studio are indistinguishable on disk) */
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
