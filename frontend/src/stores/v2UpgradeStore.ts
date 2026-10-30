import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { episodePersistStorage } from "../utils/episodePersistStorage";

type V2UpgradeStore = {
  /** the AMVerge 2 release the updater found */
  update: Update | null;
  /** "Later" hides it for this session; the next launch asks again */
  dismissed: boolean;
  dismiss: () => void;
};

export const useV2UpgradeStore = create<V2UpgradeStore>()((set) => ({
  update: null,
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}));

// AMVerge 2 imports these on first launch; the key names are the same in both apps
const EXPORTED_KEYS = [
  "amverge.generalSettings.v2",
  "amverge.theme.v2",
  "amverge.ui.v1",
  "amverge_export_dir_v1",
  "amverge_episode_panel_metadata_v1",
  "amverge.featuredProfileIcons",
];

/** writes settings and the episode list where AMVerge 2 looks for them */
export async function exportForV2(): Promise<void> {
  const localStorageValues = Object.fromEntries(
    EXPORTED_KEYS.map((key) => [key, localStorage.getItem(key)]),
  );
  const episodePanel = await episodePersistStorage.getItem("amverge_episode_panel_v1");
  await invoke("write_v2_migration", {
    json: JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      localStorage: localStorageValues,
      episodePanel,
    }),
  });
}
