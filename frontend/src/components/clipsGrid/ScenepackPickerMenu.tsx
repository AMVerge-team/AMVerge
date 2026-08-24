import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useScenepacksStore } from "../../stores/scenepackStore";
import { addClipsToScenepack } from "../../utils/scenepackAdd";
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

  const leaveTimerRef = useRef<number | null>(null);

  // onClose comes from a tile that re-renders constantly (hover, playback,
  // preview state), so it is read through a ref. Depending on it directly tore
  // the listeners down and rebuilt them on every one of those renders, which is
  // what left the menu stuck open.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Anything that means "I am done here" closes it: a press outside, Escape,
  // or the window losing focus.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".scenepack-picker-menu")) return;
      // Only THIS tile's button is exempt, so it can toggle its own menu shut.
      // Matching every tile's button meant pressing a neighbour's left this one
      // hanging around until the pointer-leave timer got round to it.
      const anchorEl = target?.closest("[data-scenepack-anchor]") as HTMLElement | null;
      if (anchorEl?.dataset.scenepackAnchor === clip.id) return;
      onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };

    const onBlur = () => onCloseRef.current();
    // The menu is placed in window coordinates, so a scroll UNDER it leaves it
    // pointing at nothing, and it goes at once — no easing, no timer. Scrolling
    // the pack list inside it is the opposite of leaving, so those events are
    // let through; without that the list could never be scrolled at all.
    const onScroll = (e: Event) => {
      const target = e.target as Element | null;
      if (target?.closest?.(".scenepack-picker-menu")) return;
      onCloseRef.current();
    };

    // capture, so a handler that stops propagation on its way up cannot keep
    // the menu alive, and so a scrolling container is caught as well as the page
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("wheel", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", onScroll, true);
    };
  }, [clip.id]);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  // Moving the pointer away closes it too. The grace period is short — just
  // enough that clipping a corner on the way in does not dismiss it, not enough
  // to read as the menu lingering.
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

  // The click point is only a starting position: measured once mounted, the
  // menu is pulled back inside the window and flipped above the cursor when
  // there is no room below it.
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

  // Starts the add and closes. The cutting happens in the background and the
  // clip shows up in the pack as a placeholder until its file exists.
  const handlePick = (pack: ScenepackEntry) => {
    addClipsToScenepack([clip], pack.id, episodeId);
    onClose();
  };

  // portalled to <body>: this mounts from inside a clip tile, and
  // `.clip-wrapper:hover` applies a transform — which makes the tile the
  // containing block for any `position: fixed` descendant, so without the
  // portal the menu would be trapped inside the tile's own bounds.
  return createPortal(
    <div
      ref={menuRef}
      className="episode-context-menu scenepack-picker-menu"
      style={{ left: placement.left, top: placement.top }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* only the packs scroll — "New Scenepack…" stays reachable however many
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
