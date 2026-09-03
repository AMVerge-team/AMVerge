import { useEffect, useMemo, useRef } from "react";
import GridPageLayout from "../components/GridPageLayout";
import { useAppStateStore } from "../stores/appStore";
import { useScenepacksStore } from "../stores/scenepackStore";
import { useScenepackPendingStore } from "../stores/scenepackPendingStore";
import { selectOverlayOpen, useUIStateStore } from "../stores/UIStore";
import type { ClipItem } from "../types/domain";

function scenepackClipToClipItem(
  spId: string,
  clip: { episodeId: string; sceneIndex: number; input: string; originalPath?: string; startSec?: number; endSec?: number; clipPath?: string; thumbnail: string; sourceKind?: "video" | "webp" },
  index: number
): ClipItem {
  return {
    id: `${spId}_${index}`,
    src: clip.input,
    originalPath: clip.originalPath,
    thumbnail: clip.thumbnail,
    sceneIndex: index,
    startSec: clip.startSec,
    endSec: clip.endSec,
    clipPath: clip.clipPath,
    originalName: `Scene ${clip.sceneIndex}`,
    episodeId: clip.episodeId,
    sourceKind: clip.sourceKind,
  };
}

export default function ScenepacksPage() {
  const overlayOpen = useUIStateStore(selectOverlayOpen);
  const openedScenepackId = useScenepacksStore((s) => s.openedScenepackId);
  const scenepacks = useScenepacksStore((s) => s.scenepacks);
  const openedScenepack = useMemo(
    () => scenepacks.find((sp) => sp.id === openedScenepackId) ?? null,
    [scenepacks, openedScenepackId]
  );

  const prevClipsRef = useRef<ClipItem[] | null>(null);
  const prevVideoPathRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      const s = useAppStateStore.getState();
      prevClipsRef.current = s.clips;
      prevVideoPathRef.current = s.importedVideoPath;
      mountedRef.current = true;
    }

    return () => {
      const s = useAppStateStore.getState();
      s.setClips(prevClipsRef.current ?? []);
      s.setImportedVideoPath(prevVideoPathRef.current);
      s.setImportToken(Date.now().toString());
      s.setFocusedClip(null);
      // selection is by clip id and the ids differ per page, so anything still
      // selected here would keep inflating the episode grid's "N selected"
      s.setSelectedClips(new Set());
    };
  }, []);

  useEffect(() => {
    const store = useAppStateStore.getState();
    const sp = useScenepacksStore.getState().scenepacks.find((s) => s.id === openedScenepackId);
    store.setClips(sp ? sp.clips.map((c, i) => scenepackClipToClipItem(sp.id, c, i)) : []);
    store.setImportedVideoPath(null);
    store.setImportToken(Date.now().toString());
    // entering a pack (or switching packs) starts with a clean selection
    // ids from the episode grid don't refer to anything here
    store.setSelectedClips(new Set());
    store.setFocusedClip(null);
  }, [openedScenepackId]);

  // clips still being cut into this pack, drawn from their episode copy so the
  // tile is not blank while it waits. they are not in the pack yet; they land
  // in the store proper once the CLI has produced their own file
  const pending = useScenepackPendingStore((s) => s.pending);
  const pendingClips = useMemo<ClipItem[]>(() => {
    if (!openedScenepackId) return [];
    return pending
      .filter((p) => p.scenepackId === openedScenepackId)
      .map((p) => ({
        ...p.source,
        id: `pending_${p.key}`,
        originalName: p.error ? `Failed: ${p.error}` : "Adding...",
      }));
  }, [pending, openedScenepackId]);

  useEffect(() => {
    if (!openedScenepack) return;
    const clips = openedScenepack.clips.map((c, i) =>
      scenepackClipToClipItem(openedScenepack.id, c, i)
    );
    useAppStateStore.getState().setClips([...clips, ...pendingClips]);
  }, [openedScenepack, pendingClips]);

  return (
    <GridPageLayout
      active={!overlayOpen}
      showImportControls={false}
    />
  );
}
