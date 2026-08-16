import { useEffect, useMemo, useRef } from "react";
import MainLayout from "../MainLayout";
import ImportButtons from "../components/ImportButtons";
import { useAppStateStore } from "../stores/appStore";
import { useScenepacksStore } from "../stores/scenepackStore";
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
    };
  }, []);

  useEffect(() => {
    const store = useAppStateStore.getState();
    const sp = useScenepacksStore.getState().scenepacks.find((s) => s.id === openedScenepackId);
    store.setClips(sp ? sp.clips.map((c, i) => scenepackClipToClipItem(sp.id, c, i)) : []);
    store.setImportedVideoPath(null);
    store.setImportToken(Date.now().toString());
  }, [openedScenepackId]);

  useEffect(() => {
    if (!openedScenepack) return;
    const clips = openedScenepack.clips.map((c, i) =>
      scenepackClipToClipItem(openedScenepack.id, c, i)
    );
    useAppStateStore.getState().setClips(clips);
  }, [openedScenepack]);

  if (!openedScenepack) {
    return (
      <div className="scenepacks-empty-state">
        <h3>No Scenepack opened</h3>
        <p>Select a Scenepack from the sidebar to view its clips.</p>
      </div>
    );
  }

  return (
    <>
      <ImportButtons showImportControls={false} />
      <div className="main-layout-wrapper">
        <MainLayout intro={false} />
      </div>
    </>
  );
}
