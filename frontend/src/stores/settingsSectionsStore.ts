import { create } from "zustand";
import { persist } from "zustand/middleware";

type SettingsSectionsState = {
  openSections: Record<string, boolean>;
  setSectionOpen: (id: string, open: boolean) => void;
};

export const useSettingsSectionsStore = create<SettingsSectionsState>()(
  persist(
    (set) => ({
      openSections: {},
      setSectionOpen: (id, open) =>
        set((state) => ({
          openSections: { ...state.openSections, [id]: open },
        })),
    }),
    {
      name: "amverge.settingsSections.v1",
    }
  )
);
