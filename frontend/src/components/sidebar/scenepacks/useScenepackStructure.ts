import { useMemo } from "react";
import type { ScenepackEntry, ScenepackFolder } from "../../../types/domain";

export type ScenepackStructure = {
  foldersByParentId: Map<string | null, ScenepackFolder[]>;
  scenepacksByFolderId: Map<string, ScenepackEntry[]>;
  rootScenepacks: ScenepackEntry[];
};

// groups packs and folders into the parent/child maps the tree renders from
export function useScenepackStructure(
  scenepacks: ScenepackEntry[],
  folders: ScenepackFolder[]
): ScenepackStructure {
  return useMemo(() => {
    const folderById = new Map<string, ScenepackFolder>();
    const foldersByParentId = new Map<string | null, ScenepackFolder[]>();
    const scenepacksByFolderId = new Map<string, ScenepackEntry[]>();
    const rootScenepacks: ScenepackEntry[] = [];

    for (const f of folders) {
      folderById.set(f.id, f);
      const siblings = foldersByParentId.get(f.parentId) ?? [];
      siblings.push(f);
      foldersByParentId.set(f.parentId, siblings);
    }

    for (const sp of scenepacks) {
      if (sp.folderId && folderById.has(sp.folderId)) {
        const list = scenepacksByFolderId.get(sp.folderId) ?? [];
        list.push(sp);
        scenepacksByFolderId.set(sp.folderId, list);
      } else {
        rootScenepacks.push(sp);
      }
    }

    return { foldersByParentId, scenepacksByFolderId, rootScenepacks };
  }, [scenepacks, folders]);
}

/**
 * a pack's own cover if one was set, otherwise the first clip's thumbnail,
 * which is the default and what every pack had before covers existed
 */
export function scenepackCover(pack: ScenepackEntry): string | null {
  return pack.thumbnail ?? pack.clips[0]?.thumbnail ?? null;
}
