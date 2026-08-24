import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FaSpinner } from "react-icons/fa";
import { useScenepacksStore } from "../../stores/scenepackStore";
import { materializeClipsForScenepack } from "../../utils/scenepackMaterialize";
import type { ClipItem, ScenepackEntry } from "../../types/domain";

type ScenepackPickerMenuProps = {
  clip: ClipItem;
  episodeId: string;
  /** Where the menu opens — the click that spawned it. */
  anchor: { x: number; y: number };
  onClose: () => void;
  /** Opens the full modal, which is where a new Scenepack gets named. */
  onCreateNew: () => void;
};

/**
 * Picks the Scenepack a clip goes into, right on the tile.
 *
 * Adding used to mean opening a modal, choosing a pack, waiting for the clip to
 * be cut, and being thrown onto the Scenepacks page. Sorting a grid is a
 * repetitive job, so this does the same work in one click and leaves you where
 * you were — the modal is still there for naming a new pack.
 */
export function ScenepackPickerMenu({
  clip,
  episodeId,
  anchor,
  onClose,
  onCreateNew,
}: ScenepackPickerMenuProps) {
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const scenepackFolders = useScenepacksStore((s) => s.scenepackFolders);
  const addClipToScenepack = useScenepacksStore((s) => s.addClipToScenepack);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Any click outside closes it, the way the panel context menus behave. While
  // a clip is being cut the menu stays put, so the spinner is visible until the
  // work finishes rather than vanishing mid-add.
  useEffect(() => {
    if (busyId) return;
    const close = () => onClose();
    window.addEventListener("click", close, { once: true });
    return () => window.removeEventListener("click", close);
  }, [busyId, onClose]);

  const sceneIndex = clip.sceneIndex ?? 0;

  const alreadyIn = useMemo(() => {
    const ids = new Set<string>();
    for (const pack of scenepacks) {
      if (pack.clips.some((c) => c.episodeId === episodeId && c.sceneIndex === sceneIndex)) {
        ids.add(pack.id);
      }
    }
    return ids;
  }, [scenepacks, episodeId, sceneIndex]);

  // Grouped by folder so a long list stays readable; packs outside any folder
  // come first, since those are the ones a quick pass tends to use.
  const groups = useMemo(() => {
    const known = new Map(scenepackFolders.map((f) => [f.id, f.name]));
    const root: ScenepackEntry[] = [];
    const byFolder = new Map<string, ScenepackEntry[]>();

    for (const pack of scenepacks) {
      if (pack.folderId && known.has(pack.folderId)) {
        const list = byFolder.get(pack.folderId) ?? [];
        list.push(pack);
        byFolder.set(pack.folderId, list);
      } else {
        root.push(pack);
      }
    }

    return [
      { id: null, name: null, packs: root },
      ...scenepackFolders
        .filter((f) => (byFolder.get(f.id) ?? []).length > 0)
        .map((f) => ({ id: f.id, name: f.name, packs: byFolder.get(f.id) ?? [] })),
    ].filter((g) => g.packs.length > 0);
  }, [scenepacks, scenepackFolders]);

  const handlePick = async (pack: ScenepackEntry) => {
    setBusyId(pack.id);
    setError(null);
    try {
      const { clips, failedCount } = await materializeClipsForScenepack(
        [clip],
        pack.id,
        episodeId
      );
      if (clips.length === 0) {
        setError(failedCount > 0 ? "Could not add this clip." : "Nothing to add.");
        return;
      }
      addClipToScenepack(pack.id, clips[0]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  // portalled to <body>: this mounts from inside a clip tile, and
  // `.clip-wrapper:hover` applies a transform — which makes the tile the
  // containing block for any `position: fixed` descendant, so without the
  // portal the menu would be trapped inside the tile's own bounds.
  return createPortal(
    <div
      className="episode-context-menu scenepack-picker-menu"
      style={{ left: anchor.x, top: anchor.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {groups.map((group) => (
        <div key={group.id ?? "root"}>
          {group.name && <div className="episode-context-menu-label">{group.name}</div>}

          {group.packs.map((pack) => {
            const isIn = alreadyIn.has(pack.id);
            return (
              <button
                key={pack.id}
                type="button"
                className="episode-context-menu-item scenepack-picker-item"
                onClick={() => void handlePick(pack)}
                disabled={isIn || busyId !== null}
              >
                <span className="scenepack-picker-name">{pack.name}</span>
                {busyId === pack.id ? (
                  <FaSpinner className="scenepack-spinner" aria-hidden="true" />
                ) : (
                  <span className="scenepack-picker-count">{isIn ? "added" : pack.clips.length}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {groups.length > 0 && <div className="episode-context-menu-separator" />}

      <button
        type="button"
        className="episode-context-menu-item"
        onClick={() => {
          onClose();
          onCreateNew();
        }}
        disabled={busyId !== null}
      >
        New Scenepack…
      </button>

      {error && <div className="scenepack-picker-error">{error}</div>}
    </div>,
    document.body
  );
}
