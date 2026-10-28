import { useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useUIStateStore } from "../stores/UIStore";
import { useSceneScoutStore } from "../stores/sceneScoutStore";

type UseDragDropImportProps = {
  handleImport: (file: string) => void | Promise<void>;
  handleBatchImport: (files: string[]) => void | Promise<void>;
};

export default function useDragDropImport({
  handleImport,
  handleBatchImport,
}: UseDragDropImportProps) {
  const lastExternalDropRef = useRef<{ path: string; ts: number } | null>(null);
  const setIsDragging = useUIStateStore((state) => state.setIsDragging);

  // use refs for handlers to avoid restarting the effect if they change
  const handlersRef = useRef({ handleImport, handleBatchImport });
  useEffect(() => {
    handlersRef.current = { handleImport, handleBatchImport };
  }, [handleImport, handleBatchImport]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    // a drop while another job runs still goes through: the import asks whether to stop it
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      const type = event.payload.type;

      if (type === "over") {
        const paths = (event.payload as { paths?: string[] }).paths;
        const hasPaths = Array.isArray(paths) && paths.length > 0;
        setIsDragging(hasPaths);
        return;
      }

      if (type === "drop") {
        setIsDragging(false);

        const paths = event.payload.paths;
        if (!paths || paths.length === 0) return;

        const now = Date.now();
        const last = lastExternalDropRef.current;

        if (last && last.path === paths[0] && now - last.ts < 500) return;

        lastExternalDropRef.current = { path: paths[0], ts: now };

        const videoExtensions = ["mp4", "mkv", "mov"];

        const videoFiles = paths.filter((path: string) => {
          const ext = path.split(".").pop()?.toLowerCase() || "";
          return videoExtensions.includes(ext);
        });

        if (videoFiles.length === 0) return;

        // the Flow tab takes a dropped video as the clip to continue, same as its Import button
        const scout = useSceneScoutStore.getState();
        const page = useUIStateStore.getState().activePage;
        if (page === "sceneScout" && scout.mode === "flow") {
          const path = videoFiles[0];
          void scout.startFlowSearch({ path, label: path.split(/[/\\]/).pop() ?? path });
          return;
        }
        // anywhere else it is a library import, shown in the library rather than another page's grid
        if (page !== "home") useUIStateStore.getState().setActivePage("home");

        if (videoFiles.length === 1) {
          void Promise.resolve(handlersRef.current.handleImport(videoFiles[0])).catch((error) => {
            console.error("[import][drag-drop] single import failed", {
              file: videoFiles[0],
              error,
              message: error instanceof Error ? error.message : String(error),
            });
          });
        } else {
          void Promise.resolve(handlersRef.current.handleBatchImport(videoFiles)).catch((error) => {
            console.error("[import][drag-drop] batch import failed", {
              files: videoFiles.length,
              firstFile: videoFiles[0],
              error,
              message: error instanceof Error ? error.message : String(error),
            });
          });
        }

        return;
      }

      setIsDragging(false);
    });

    void unlistenPromise.then((stop) => {
      if (disposed) {
        stop();
        return;
      }

      unlisten = stop;
    });

    return () => {
      disposed = true;
      setIsDragging(false);

      if (unlisten) {
        unlisten();
        return;
      }

      void unlistenPromise.then((stop) => stop());
    };
  }, [setIsDragging]);
}