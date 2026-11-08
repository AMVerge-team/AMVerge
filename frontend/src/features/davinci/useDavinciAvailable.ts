import { useEffect, useState } from "react";
import { useGeneralSettingsStore } from "../../stores/settingsStore";
import { detectDavinciResolve } from "./resolveImport";

/** whether Resolve is on this machine (Free and Studio are indistinguishable on disk); the lookup runs once per launch */
export function useDavinciInstalled(): boolean {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    let alive = true;
    void detectDavinciResolve().then((detection) => {
      if (alive) setInstalled(Boolean(detection?.installed));
    });
    return () => {
      alive = false;
    };
  }, []);

  return installed;
}

/** whether to offer Resolve export: feature on and Resolve installed */
export function useDavinciAvailable(): boolean {
  const enabled = useGeneralSettingsStore((s) => s.davinciResolveEnabled);
  const installed = useDavinciInstalled();
  return enabled && installed;
}
