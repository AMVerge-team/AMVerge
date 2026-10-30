import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useScenepacksStore } from "../../stores/scenepackStore";
import { addClipsToScenepack } from "../../utils/scenepackAdd";
import type { ClipItem, ScenepackEntry } from "../../types/domain";
import { useEscapeToClose } from "../common/useEscapeToClose";

type ScenepackPickerMenuProps = {
  clip: ClipItem;
  episodeId: string;
  /** where the menu opens, the click that spawned it */
  anchor: { x: number; y: number };
  onClose: () => void;
  /** opens the full modal, which is where a new Scenepack gets named */
  onCreateNew: () => void;
};

/** picks the Scenepack a clip goes into, right on the tile, without leaving the grid */
export function ScenepackPickerMenu({
  clip,
  episodeId,
  anchor,
  onClose,
  onCreateNew,
}: ScenepackPickerMenuProps) {
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const scenepackFolders = useScenepacksStore((s) => s.scenepackFolders);
  // only set while viewing a pack, the only place "use as cover" applies
  const openedScenepackId = useScenepacksStore((s) => s.openedScenepackId);
  const setScenepackThumbnail = useScenepacksStore((s) => s.setScenepackThumbnail);

  const leaveTimerRef = useRef<number | null>(null);

  // read through a ref: depending on the tile's ever-changing onClose rebuilt the listeners and left the menu stuck open
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // a press outside, Escape, or losing window focus closes it
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".scenepack-picker-menu")) return;
      // only this tile's button is exempt, so it can toggle its own menu shut
      const anchorEl = target?.closest("[data-scenepack-anchor]") as HTMLElement | null;
      if (anchorEl?.dataset.scenepackAnchor === clip.id) return;
      onCloseRef.current();
    };
    const onBlur = () => onCloseRef.current();
    // a scroll under the menu closes it at once; scrolling the pack list inside it doesn't
    const onScroll = (e: Event) => {
      const target = e.target as Element | null;
      if (target?.closest?.(".scenepack-picker-menu")) return;
      onCloseRef.current();
    };

    // capture, so stopped propagation or a scrolling container can't keep the menu alive
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("wheel", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", onScroll, true);
    };
  }, [clip.id]);

  useEscapeToClose(() => onCloseRef.current());

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  // leaving closes it after a short grace, so clipping a corner on the way in doesn't
  const handleMouseLeave = () => {
    if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => onCloseRef.current(), 150);
  };

  const handleMouseEnter = () => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  // the click point is only a start: once measured, the menu is kept in the window and flipped up if needed
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState({ left: anchor.x, top: anchor.y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(anchor.x, window.innerWidth - width - margin));
    const top =
      anchor.y + height + margin > window.innerHeight
        ? Math.max(margin, anchor.y - height)
        : anchor.y;
    setPlacement({ left, top });
  }, [anchor, scenepacks.length]);

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

  // grouped by folder; packs outside any folder come first
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

  // starts the add and closes; the clip shows as a placeholder in the pack until it is cut
  const handlePick = (pack: ScenepackEntry) => {
    addClipsToScenepack([clip], pack.id, episodeId);
    onClose();
  };

  // portalled to <body>: the tile's hover transform would trap a fixed menu inside its bounds
  return createPortal(
    <div
      ref={menuRef}
      className="episode-context-menu scenepack-picker-menu"
      style={{ left: placement.left, top: placement.top }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {openedScenepackId && clip.thumbnail && (
        <>
          <button
            type="button"
            className="episode-context-menu-item"
            onClick={() => {
              setScenepackThumbnail(openedScenepackId, clip.thumbnail);
              onClose();
            }}
          >
            Set as Scenepack thumbnail
          </button>
          <div className="episode-context-menu-separator" />
        </>
      )}

      {/* only the packs scroll, "New Scenepack…" stays reachable however many
          packs there are */}
      <div className="scenepack-picker-list">
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
                onClick={() => handlePick(pack)}
                disabled={isIn}
              >
                <span className="scenepack-picker-name">{pack.name}</span>
                <span className="scenepack-picker-count">
                  {isIn ? "added" : pack.clips.length}
                </span>
              </button>
            );
          })}
        </div>
      ))}

      </div>

      {groups.length > 0 && <div className="episode-context-menu-separator" />}

      <button
        type="button"
        className="episode-context-menu-item"
        onClick={() => {
          onClose();
          onCreateNew();
        }}
      >
        New Scenepack…
      </button>

    </div>,
    document.body
  );
}
