import { useEffect, useMemo, useRef } from "react";
import MainLayout from "../MainLayout";
import { useAppStateStore } from "../stores/appStore";
import { useScenepacksStore } from "../stores/scenepackStore";
import type { ClipItem } from "../types/domain";

function scenepackClipToClipItem(
  spId: string,
  clip: { episodeId: string; sceneIndex: number; input: string; startSec?: number; endSec?: number; clipPath?: string; thumbnail: string },
  index: number
): ClipItem {
  return {
    id: `${spId}_${index}`,
    src: clip.input,
    thumbnail: clip.thumbnail,
    sceneIndex: clip.sceneIndex,
    startSec: clip.startSec,
    endSec: clip.endSec,
    clipPath: clip.clipPath,
    originalName: `Scene ${clip.sceneIndex}`,
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

    const store = useAppStateStore.getState();
    if (openedScenepack) {
      const clips = openedScenepack.clips.map((c, i) =>
        scenepackClipToClipItem(openedScenepack.id, c, i)
      );
      store.setClips(clips);
      store.setImportedVideoPath(openedScenepack.name);
      store.setImportToken(Date.now().toString());
    } else {
      store.setClips([]);
      store.setImportedVideoPath(null);
      store.setImportToken(Date.now().toString());
    }

    return () => {
      const s = useAppStateStore.getState();
      if (prevClipsRef.current) {
        s.setClips(prevClipsRef.current);
      } else {
        s.setClips([]);
      }
      s.setImportedVideoPath(prevVideoPathRef.current);
      s.setImportToken(Date.now().toString());
      s.setFocusedClip(null);
    };
  }, [openedScenepack]);

  if (!openedScenepack) {
    return (
      <div className="scenepacks-empty-state">
        <h3>No Scenepack opened</h3>
        <p>Select a Scenepack from the sidebar to view its clips.</p>
      </div>
    );
  }

  return <MainLayout intro={false} />;
}
