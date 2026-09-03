import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScenepackEntry, ScenepackFolder, ScenepackClip } from "../types/domain";

export type ScenepacksState = {
  scenepacks: ScenepackEntry[];
  scenepackFolders: ScenepackFolder[];
  selectedScenepackId: string | null;
  selectedScenepackFolderId: string | null;
  openedScenepackId: string | null;
};

export type ScenepacksStore = ScenepacksState & {
  addScenepack: (name: string, folderId: string | null) => string;
  removeScenepack: (id: string) => void;
  renameScenepack: (id: string, name: string) => void;
  /** pass null to fall back to the first clip's thumbnail */
  setScenepackThumbnail: (id: string, thumbnail: string | null) => void;
  addClipToScenepack: (scenepackId: string, clip: ScenepackClip) => void;
  removeClipFromScenepack: (scenepackId: string, episodeId: string, sceneIndex: number) => void;
  removeClipFromScenepackByIndex: (scenepackId: string, index: number) => void;
  /** batch form of the above. removing indexes one at a time would shift every
   * later index after the first splice, so a multi-select delete has to filter
   * against the whole set in one pass */
  removeClipsFromScenepackByIndexes: (scenepackId: string, indexes: number[]) => void;
  reorderScenepackClips: (scenepackId: string, fromIndex: number, toIndex: number) => void;
  moveScenepackToFolder: (scenepackId: string, folderId: string | null) => void;

  setScenepackFolders: (folders: ScenepackFolder[] | ((prev: ScenepackFolder[]) => ScenepackFolder[])) => void;
  addScenepackFolder: (name: string, parentId: string | null) => string;
  removeScenepackFolder: (folderId: string) => void;
  renameScenepackFolder: (folderId: string, name: string) => void;
  toggleScenepackFolderExpanded: (folderId: string) => void;
  moveScenepackFolder: (folderId: string, parentFolderId: string | null, beforeFolderId?: string) => void;

  setSelectedScenepackId: (id: string | null) => void;
  setSelectedScenepackFolderId: (id: string | null) => void;
  setOpenedScenepackId: (id: string | null) => void;
  sortScenepacks: (direction: "asc" | "desc") => void;

  resetScenepacks: () => void;
};

const DEFAULT_STATE: ScenepacksState = {
  scenepacks: [],
  scenepackFolders: [],
  selectedScenepackId: null,
  selectedScenepackFolderId: null,
  openedScenepackId: null,
};

export const useScenepacksStore = create<ScenepacksStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      addScenepack: (name, folderId) => {
        const id = crypto.randomUUID();
        set((s) => ({
          scenepacks: [
            ...s.scenepacks,
            { id, name, folderId, createdAt: Date.now(), clips: [] },
          ],
        }));
        return id;
      },

      removeScenepack: (id) =>
        set((s) => ({
          scenepacks: s.scenepacks.filter((sp) => sp.id !== id),
          selectedScenepackId: s.selectedScenepackId === id ? null : s.selectedScenepackId,
          openedScenepackId: s.openedScenepackId === id ? null : s.openedScenepackId,
        })),

      renameScenepack: (id, name) =>
        set((s) => ({
          scenepacks: s.scenepacks.map((sp) =>
            sp.id === id ? { ...sp, name } : sp
          ),
        })),

      setScenepackThumbnail: (id, thumbnail) =>
        set((s) => ({
          scenepacks: s.scenepacks.map((sp) =>
            sp.id === id ? { ...sp, thumbnail } : sp
          ),
        })),

      addClipToScenepack: (scenepackId, clip) =>
        set((s) => ({
          scenepacks: s.scenepacks.map((sp) => {
            if (sp.id !== scenepackId) return sp;
            const exists = sp.clips.some(
              (c) => c.episodeId === clip.episodeId && c.sceneIndex === clip.sceneIndex
            );
            if (exists) return sp;
            return { ...sp, clips: [...sp.clips, clip] };
          }),
        })),

      removeClipFromScenepack: (scenepackId, episodeId, sceneIndex) =>
        set((s) => ({
          scenepacks: s.scenepacks.map((sp) => {
            if (sp.id !== scenepackId) return sp;
            return {
              ...sp,
              clips: sp.clips.filter(
                (c) => !(c.episodeId === episodeId && c.sceneIndex === sceneIndex)
              ),
            };
          }),
        })),

      removeClipFromScenepackByIndex: (scenepackId, index) =>
        set((s) => ({
          scenepacks: s.scenepacks.map((sp) => {
            if (sp.id !== scenepackId) return sp;
            const clips = [...sp.clips];
            clips.splice(index, 1);
            return { ...sp, clips };
          }),
        })),

      removeClipsFromScenepackByIndexes: (scenepackId, indexes) =>
        set((s) => {
          const drop = new Set(indexes);
          if (drop.size === 0) return s;
          return {
            scenepacks: s.scenepacks.map((sp) =>
              sp.id === scenepackId
                ? { ...sp, clips: sp.clips.filter((_, i) => !drop.has(i)) }
                : sp,
            ),
          };
        }),

      reorderScenepackClips: (scenepackId, fromIndex, toIndex) =>
        set((s) => ({
          scenepacks: s.scenepacks.map((sp) => {
            if (sp.id !== scenepackId) return sp;
            const clips = [...sp.clips];
            const [moved] = clips.splice(fromIndex, 1);
            clips.splice(toIndex, 0, moved);
            return { ...sp, clips };
          }),
        })),

      moveScenepackToFolder: (scenepackId, folderId) =>
        set((s) => ({
          scenepacks: s.scenepacks.map((sp) =>
            sp.id === scenepackId ? { ...sp, folderId } : sp
          ),
        })),

      setScenepackFolders: (folders) =>
        set((s) => ({
          scenepackFolders:
            typeof folders === "function" ? folders(s.scenepackFolders) : folders,
        })),

      addScenepackFolder: (name, parentId) => {
        const id = crypto.randomUUID();
        set((s) => ({
          scenepackFolders: [
            ...s.scenepackFolders,
            { id, name, parentId, isExpanded: true },
          ],
        }));
        return id;
      },

      removeScenepackFolder: (folderId) =>
        set((s) => {
          const idsToRemove = new Set<string>();
          const collect = (pid: string | null) => {
            for (const f of s.scenepackFolders) {
              if (f.parentId === pid) {
                idsToRemove.add(f.id);
                collect(f.id);
              }
            }
          };
          idsToRemove.add(folderId);
          collect(folderId);
          return {
            scenepackFolders: s.scenepackFolders.filter((f) => !idsToRemove.has(f.id)),
            scenepacks: s.scenepacks.map((sp) =>
              sp.folderId === folderId ? { ...sp, folderId: null } : sp
            ),
            selectedScenepackFolderId:
              s.selectedScenepackFolderId === folderId ? null : s.selectedScenepackFolderId,
          };
        }),

      renameScenepackFolder: (folderId, name) =>
        set((s) => ({
          scenepackFolders: s.scenepackFolders.map((f) =>
            f.id === folderId ? { ...f, name } : f
          ),
        })),

      toggleScenepackFolderExpanded: (folderId) =>
        set((s) => ({
          scenepackFolders: s.scenepackFolders.map((f) =>
            f.id === folderId ? { ...f, isExpanded: !f.isExpanded } : f
          ),
        })),

      moveScenepackFolder: (folderId, parentFolderId, beforeFolderId) =>
        set((s) => {
          const folders = s.scenepackFolders.map((f) =>
            f.id === folderId ? { ...f, parentId: parentFolderId } : f
          );
          if (!beforeFolderId) return { scenepackFolders: folders };
          const siblings = folders.filter((f) => f.parentId === parentFolderId);
          const targetIdx = siblings.findIndex((f) => f.id === beforeFolderId);
          const moved = siblings.find((f) => f.id === folderId);
          if (!moved || targetIdx < 0) return { scenepackFolders: folders };
          const reordered = siblings.filter((f) => f.id !== folderId);
          reordered.splice(targetIdx, 0, moved);
          const nonSiblings = folders.filter((f) => f.parentId !== parentFolderId);
          return { scenepackFolders: [...nonSiblings, ...reordered] };
        }),

      setSelectedScenepackId: (id) => set({ selectedScenepackId: id }),
      setSelectedScenepackFolderId: (id) => set({ selectedScenepackFolderId: id }),
      setOpenedScenepackId: (id) => set({ openedScenepackId: id }),

      sortScenepacks: (direction) =>
        set((s) => {
          const sorted = [...s.scenepacks].sort((a, b) => {
            const cmp = a.name.localeCompare(b.name);
            return direction === "asc" ? cmp : -cmp;
          });
          return { scenepacks: sorted };
        }),

      resetScenepacks: () => set({ ...DEFAULT_STATE }),
    }),
    {
      name: "amverge_scenepacks_v1",
    }
  )
);
