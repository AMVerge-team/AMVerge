commit 7990132d1060b8f32a2a6bb2c1e6e20c82e842dd
Author: Crptk <144494482+crptk@users.noreply.github.com>
Date:   Wed May 6 22:14:38 2026 -0400

    Cs scenedetect (#33)
    
    * Scene detection enhancements.
    
    * Simplify and fix bugs
    
    * Disable import button during processing.
    
    * Update for refactor.
    
    * Bug fixes from merge conflicts.
    
    * FIX: fixed issue where right preview would not reflect the same clip as merged hover preview
    
    * Updated scene detection algorithm
    
    * Updated frontend
    
    ---------
    
    Co-authored-by: ligatima <ahshxhsu@gmail.com>

diff --git a/frontend/src/hooks/useImportExport.ts b/frontend/src/hooks/useImportExport.ts
index a7ac03c..a7ba1ae 100644
--- a/frontend/src/hooks/useImportExport.ts
+++ b/frontend/src/hooks/useImportExport.ts
@@ -1,5 +1,6 @@
 import { useRef, startTransition, useCallback } from "react";
 import { invoke } from "@tauri-apps/api/core";
+import { listen } from "@tauri-apps/api/event";
 import { open, save } from "@tauri-apps/plugin-dialog";
 import { ClipItem, EpisodeEntry } from "../types/domain"
 import { fileNameFromPath, truncateFileName, detectScenes } from "../utils/episodeUtils";
@@ -31,15 +32,135 @@ export default function useImportExport(props?: ImportExportProps) {
   const setBatchCurrentFile = appState.setBatchCurrentFile;
 
   const importGenRef = useRef(0);
+  const positionToIdRef = useRef(new Map<number, string>());
   const localAbortedRef = useRef(false);
   const abortedRef = props?.abortedRef || localAbortedRef;
 
+  function parseInitialClips(clipsJson: string): ClipItem[] {
+    const scenes: any[] = JSON.parse(clipsJson);
+    return scenes.map((s, pos) => {
+      const id = crypto.randomUUID();
+      positionToIdRef.current.set(pos, id);
+      return {
+        id,
+        src: s.path,
+        thumbnail: s.thumbnail,
+        originalName: s.original_file,
+        start: s.start,
+        end: s.end,
+        thumbnailReady: s.thumbnail_ready !== false,
+      };
+    });
+  }
+
+  function finalizeClips(clips: ClipItem[]): ClipItem[] {
+    return clips.map(({ thumbnailReady: _, ...rest }) => rest as ClipItem);
+  }
+
   const handleImport = useCallback(async (file: string | null) => {
-    // This opens the file dialog to select a video file
     if (!file) return;
 
     const episodeId = crypto.randomUUID();
     const gen = ++importGenRef.current;
+    positionToIdRef.current = new Map();
+
+    // Tracks clip IDs whose thumbnail_ready arrived before clips were committed to the store.
+    const pendingThumbnailReadyIds = new Set<string>();
+
+    let thumbReadyCount = 0;
+    let thumbReadyBeforeStore = 0;
+    let pairResultCount = 0;
+    let pairResultBeforeStore = 0;
+
+    // Batched updates: instead of one Zustand setState per event (which triggers a
+    // synchronous React re-render via useSyncExternalStore each time), we accumulate
+    // all thumbnail_ready and pair_result changes and flush them once per animation frame.
+    const batchedThumbIds = new Set<string>();
+    const batchedMerges: Array<{ clipAId: string; clipBId: string }> = [];
+    let batchRafId: number | null = null;
+
+    const applyBatchedUpdates = (activeEpisodeId: string) => {
+      if (importGenRef.current !== gen) return;
+
+      const thumbIds = new Set(batchedThumbIds);
+      batchedThumbIds.clear();
+      const merges = batchedMerges.splice(0);
+
+      if (thumbIds.size === 0 && merges.length === 0) return;
+
+      console.log(`[batch flush] thumbIds=${thumbIds.size} merges=${merges.length}`);
+
+      useAppStateStore.setState(s => {
+        let clips = s.clips;
+        let bgProgress = s.bgProgress;
+        let changed = false;
+
+        // Apply merges sequentially so chained merges (AΓåÆB then BΓåÆC) work correctly.
+        for (const { clipAId, clipBId } of merges) {
+          const removed = clips.find(c => c.id === clipAId);
+          if (!removed) continue;
+          const removedSrcs = removed.mergedSrcs ?? [removed.src];
+          const mergeInto = (c: ClipItem) =>
+            c.id !== clipBId ? c : { ...c, mergedSrcs: [...removedSrcs, ...(c.mergedSrcs ?? [c.src])] };
+          clips = clips.filter(c => c.id !== clipAId).map(mergeInto);
+          changed = true;
+        }
+
+        // Apply thumbnail ready flags.
+        if (thumbIds.size > 0) {
+          let thumbsApplied = 0;
+          const newClips = clips.map(c => {
+            if (thumbIds.has(c.id) && !c.thumbnailReady) { thumbsApplied++; return { ...c, thumbnailReady: true }; }
+            return c;
+          });
+          if (thumbsApplied > 0) {
+            clips = newClips;
+            changed = true;
+            if (bgProgress) {
+              bgProgress = { ...bgProgress, done: Math.min(bgProgress.done + thumbsApplied, bgProgress.total) };
+            }
+          }
+        }
+
+        return changed ? { ...s, clips, bgProgress } : s;
+      });
+
+      if (merges.length > 0) {
+        useEpisodePanelRuntimeStore.setState(s => ({
+          episodes: s.episodes.map(ep => {
+            if (ep.id !== activeEpisodeId) return ep;
+            let epClips = ep.clips;
+            for (const { clipAId, clipBId } of merges) {
+              const removed = epClips.find(c => c.id === clipAId);
+              if (!removed) continue;
+              const removedSrcs = removed.mergedSrcs ?? [removed.src];
+              const mergeInto = (c: ClipItem) =>
+                c.id !== clipBId ? c : { ...c, mergedSrcs: [...removedSrcs, ...(c.mergedSrcs ?? [c.src])] };
+              epClips = epClips.filter(c => c.id !== clipAId).map(mergeInto);
+            }
+            return epClips === ep.clips ? ep : { ...ep, clips: epClips };
+          }),
+        }));
+      }
+    };
+
+    const scheduleBatch = (activeEpisodeId: string) => {
+      if (batchRafId !== null) return;
+      batchRafId = requestAnimationFrame(() => {
+        batchRafId = null;
+        applyBatchedUpdates(activeEpisodeId);
+      });
+    };
+
+    // Flag set by processing_complete to detect the race where it fires before
+    // the initial_clips_ready setTimeout has committed clips to the store.
+    let processingCompleted = false;
+
+    // pair_result events that arrived before clips were in the store ΓÇö replayed after commit.
+    const pendingMerges: Array<{ clipAId: string; clipBId: string }> = [];
+
+    const unlisteners: Array<() => void> = [];
+    let uiUnblocked = false;
 
     try {
       appState.setProgress(0);
@@ -51,12 +172,6 @@ export default function useImportExport(props?: ImportExportProps) {
       appState.setVideoIsHEVC(null);
       setImportToken(Date.now().toString());
 
-      const rpcButtons = [];
-      if (generalSettings.rpcShowButtons) {
-        rpcButtons.push({ label: "Discord Server", url: "https://discord.gg/asJkqwqb" });
-        rpcButtons.push({ label: "Website", url: "https://amverge.app/" });
-      }
-
       props?.onRPCUpdate?.({
         type: "update",
         details: `Detecting: ${generalSettings.rpcShowFilename ? fileNameFromPath(file) : "Video"}`,
@@ -67,59 +182,190 @@ export default function useImportExport(props?: ImportExportProps) {
         buttons: generalSettings.rpcShowButtons,
       });
 
-      const formatted = await detectScenes(file, episodeId, generalSettings.episodesPath);
+      const activeEpisodeId = episodeId;
 
-      // A newer import started while we were waiting - discard stale results.
-      if (importGenRef.current !== gen) return;
+      // ΓöÇΓöÇ initial_clips_ready: first batch of clips ready, unblock UI ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+      const ul1 = await listen<{ clips_json: string }>("initial_clips_ready", (event) => {
+        if (importGenRef.current !== gen) return;
 
-      const inferredName = formatted[0]?.originalName || fileNameFromPath(file);
+        const clips = parseInitialClips(event.payload.clips_json);
+        const inferredName = clips[0]?.originalName || fileNameFromPath(file);
+
+        const episodeEntry: EpisodeEntry = {
+          id: activeEpisodeId,
+          displayName: inferredName,
+          videoPath: file,
+          folderId: useEpisodePanelRuntimeStore.getState().selectedFolderId,
+          importedAt: Date.now(),
+          clips: finalizeClips(clips),
+        };
+
+        const notReady = clips.filter(c => c.thumbnailReady === false).length;
+        console.log(`[initial_clips_ready] clips=${clips.length} notReady=${notReady} pendingThumbIds=${pendingThumbnailReadyIds.size} uiUnblocked=${uiUnblocked}`);
+
+        // Unblock the UI immediately before any expensive state updates.
+        if (!uiUnblocked) {
+          uiUnblocked = true;
+          setLoading(false);
+          if (notReady > 0) {
+            useAppStateStore.setState({ bgProgress: { done: clips.length - notReady, total: clips.length } });
+          }
+          console.log(`[initial_clips_ready] setLoading(false), bgProgress set to ${notReady > 0 ? `{done:${clips.length - notReady}, total:${clips.length}}` : 'null'}`);
+        }
 
-      const episodeEntry: EpisodeEntry = {
-        id: episodeId,
-        displayName: inferredName,
-        videoPath: file,
-        folderId: episodeState.selectedFolderId,
-        importedAt: Date.now(),
-        clips: formatted,
-      };
+        // Add rAF probe to check if paint fires before or after the setTimeout
+        const t0 = performance.now();
+        requestAnimationFrame(() => {
+          console.log(`[rAF probe] first rAF fired at +${(performance.now() - t0).toFixed(1)}ms after setLoading(false)`);
+        });
+
+        // Defer expensive updates so React can paint the loading=false frame first.
+        setTimeout(() => {
+          console.log(`[initial_clips_ready:setTimeout] fired at +${(performance.now() - t0).toFixed(1)}ms after setLoading(false), processingCompleted=${processingCompleted}`);
+          if (importGenRef.current !== gen) return;
+
+          // Merge any thumbnail_ready events that fired before clips were in the store.
+          const clipsWithPendingThumbs = pendingThumbnailReadyIds.size > 0
+            ? clips.map(c => pendingThumbnailReadyIds.has(c.id) ? { ...c, thumbnailReady: true } : c)
+            : clips;
+
+          // If processing_complete already ran before this setTimeout, it stripped thumbnailReady
+          // from an empty store (race condition). Strip it here so clips are immediately clickable.
+          // Also queue any pre-store pair_result merges to be applied after commit.
+          const clipsToCommit = processingCompleted ? finalizeClips(clipsWithPendingThumbs) : clipsWithPendingThumbs;
+          if (processingCompleted && pendingMerges.length > 0) {
+            batchedMerges.push(...pendingMerges);
+            pendingMerges.length = 0;
+          }
 
-      episodeState.setEpisodes((prev) => [episodeEntry, ...prev]);
-      episodeState.setSelectedEpisodeId(episodeId);
-      episodeState.setOpenedEpisodeId(episodeId);
-      startTransition(() => {
-        appState.setClips(formatted);
+          console.log(`[initial_clips_ready:setTimeout] committing ${clipsToCommit.length} clips to store, pendingIds=${pendingThumbnailReadyIds.size}, pendingMerges=${batchedMerges.length}`);
+          const t1 = performance.now();
+          useEpisodePanelRuntimeStore.setState(s => ({
+            episodes: [episodeEntry, ...s.episodes],
+            selectedEpisodeId: activeEpisodeId,
+            openedEpisodeId: activeEpisodeId,
+          }));
+          useAppStateStore.setState({ clips: clipsToCommit });
+          console.log(`[initial_clips_ready:setTimeout] setState took ${(performance.now() - t1).toFixed(1)}ms ΓÇö store now has ${useAppStateStore.getState().clips.length} clips, bgProgress=${JSON.stringify(useAppStateStore.getState().bgProgress)}`);
+
+          // If processing_complete already ran, apply any pending merges now that clips are in the store.
+          if (processingCompleted && batchedMerges.length > 0) {
+            applyBatchedUpdates(activeEpisodeId);
+          }
+        }, 0);
       });
-    } catch (err) {
-      if (importGenRef.current !== gen) return;
-      console.error("Detection failed:", err);
-    } finally {
-      if (importGenRef.current === gen) setLoading(false);
-    }
-  }, [appState, episodeState, generalSettings, props?.onRPCUpdate]);
+      unlisteners.push(ul1);
 
-  const onImportClick = useCallback(async () => {
-    const files = await open({
-      multiple: true,
-      filters: [
-        {
-          name: "Video",
-          extensions: ["mp4", "mkv", "mov", "avi"]
+      // ΓöÇΓöÇ thumbnail_ready: one more clip thumbnail is on disk ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+      const ul2 = await listen<{ position: number }>("thumbnail_ready", (event) => {
+        if (importGenRef.current !== gen) return;
+
+        const clipId = positionToIdRef.current.get(event.payload.position);
+        if (!clipId) return;
+
+        thumbReadyCount++;
+        const inStore = useAppStateStore.getState().clips.some(c => c.id === clipId);
+
+        if (!inStore) {
+          // Clip not yet committed to store; track for later and update bgProgress immediately.
+          thumbReadyBeforeStore++;
+          if (thumbReadyCount <= 10) {
+            console.log(`[thumbnail_ready #${thumbReadyCount}] clip NOT in store (beforeStore=${thumbReadyBeforeStore})`);
+          }
+          pendingThumbnailReadyIds.add(clipId);
+          useAppStateStore.setState(s => {
+            if (!s.bgProgress) return s;
+            return { ...s, bgProgress: { ...s.bgProgress, done: Math.min(s.bgProgress.done + 1, s.bgProgress.total) } };
+          });
+          return;
         }
-      ]
-    });
 
-    if (!files) return;
+        if (thumbReadyCount <= 10) {
+          console.log(`[thumbnail_ready #${thumbReadyCount}] clip in store, batching`);
+        }
+        batchedThumbIds.add(clipId);
+        scheduleBatch(activeEpisodeId);
+      });
+      unlisteners.push(ul2);
+
+      // ΓöÇΓöÇ pair_result: merge decision for two adjacent clips ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+      const ul3 = await listen<{ pos_a: number; pos_b: number; should_merge: boolean }>(
+        "pair_result",
+        (event) => {
+          if (importGenRef.current !== gen) return;
+          if (!event.payload.should_merge) return;
+
+          const clipAId = positionToIdRef.current.get(event.payload.pos_a);
+          const clipBId = positionToIdRef.current.get(event.payload.pos_b);
+          if (!clipAId || !clipBId) return;
+
+          pairResultCount++;
+          const clipAInStore = useAppStateStore.getState().clips.some(c => c.id === clipAId);
+          if (!clipAInStore) pairResultBeforeStore++;
+          if (pairResultCount <= 10) {
+            console.log(`[pair_result #${pairResultCount}] clipA in store: ${clipAInStore} (store=${useAppStateStore.getState().clips.length}, beforeStore=${pairResultBeforeStore})`);
+          }
 
-    // open() with multiple:true returns string[] | null
-    const fileList = Array.isArray(files) ? files : [files];
-    if (fileList.length === 0) return;
+          if (!clipAInStore) {
+            // Store not populated yet ΓÇö save for replay after the setTimeout commits clips.
+            pendingMerges.push({ clipAId, clipBId });
+            return;
+          }
 
-    if (fileList.length === 1) {
-      handleImport(fileList[0]);
-    } else {
-      handleBatchImport(fileList);
+          batchedMerges.push({ clipAId, clipBId });
+          scheduleBatch(activeEpisodeId);
+        }
+      );
+      unlisteners.push(ul3);
+
+      // ΓöÇΓöÇ processing_complete: all thumbnails and pairs done ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
+      const ul4 = await listen<void>("processing_complete", () => {
+        if (importGenRef.current !== gen) return;
+
+        processingCompleted = true;
+
+        // Flush any events still waiting in the batch before we finalize.
+        if (batchRafId !== null) {
+          cancelAnimationFrame(batchRafId);
+          batchRafId = null;
+        }
+        applyBatchedUpdates(activeEpisodeId);
+
+        console.log(`[processing_complete] thumbReady=${thumbReadyCount} (beforeStore=${thumbReadyBeforeStore}), pairResult=${pairResultCount} (beforeStore=${pairResultBeforeStore}), store=${useAppStateStore.getState().clips.length} clips`);
+
+        const finalClips = useAppStateStore.getState().clips.map(c => {
+          const { thumbnailReady: _, ...rest } = c;
+          return rest as ClipItem;
+        });
+        useAppStateStore.setState({ clips: finalClips, bgProgress: null });
+        useEpisodePanelRuntimeStore.setState(s => ({
+          episodes: s.episodes.map(ep =>
+            ep.id === activeEpisodeId ? { ...ep, clips: finalClips } : ep
+          ),
+        }));
+      });
+      unlisteners.push(ul4);
+
+      // Fire the backend ΓÇö blocks until the sidecar exits.
+      await invoke("detect_scenes", {
+        videoPath: file,
+        episodeCacheId: episodeId,
+        customPath: generalSettings.episodesPath,
+      });
+
+    } catch (err) {
+      if (importGenRef.current !== gen) return;
+      console.error("Detection failed:", err);
+      useAppStateStore.setState({ bgProgress: null });
+    } finally {
+      if (batchRafId !== null) {
+        cancelAnimationFrame(batchRafId);
+        batchRafId = null;
+      }
+      unlisteners.forEach(ul => ul());
+      if (importGenRef.current === gen && !uiUnblocked) setLoading(false);
     }
-  }, [handleImport]);
+  }, [appState, episodeState, generalSettings, props?.onRPCUpdate]);
 
   const handleBatchImport = useCallback(async (files: string[]) => {
     const gen = ++importGenRef.current;
@@ -155,7 +401,6 @@ export default function useImportExport(props?: ImportExportProps) {
           const formatted = await detectScenes(file, episodeId, generalSettings.episodesPath);
 
           if (abortedRef.current || importGenRef.current !== gen) {
-            // Aborted or superseded mid-flight ΓÇö clean up this episode's cache
             invoke("delete_episode_cache", {
               episodeCacheId: episodeId,
               customPath: generalSettings.episodesPath,
@@ -192,7 +437,6 @@ export default function useImportExport(props?: ImportExportProps) {
         }
       }
 
-      // Open the first completed episode
       if (completedEpisodes.length > 0 && importGenRef.current === gen) {
         const first = completedEpisodes[0];
         episodeState.setSelectedEpisodeId(first.id);
@@ -213,13 +457,31 @@ export default function useImportExport(props?: ImportExportProps) {
     }
   }, [appState, episodeState, generalSettings, abortedRef]);
 
+  const onImportClick = useCallback(async () => {
+    const files = await open({
+      multiple: true,
+      filters: [{ name: "Video", extensions: ["mp4", "mkv", "mov", "avi"] }],
+    });
+
+    if (!files) return;
+    const fileList = Array.isArray(files) ? files : [files];
+    if (fileList.length === 0) return;
+
+    if (fileList.length === 1) {
+      handleImport(fileList[0]);
+    } else {
+      handleBatchImport(fileList);
+    }
+  }, [handleImport, handleBatchImport]);
+
   const handleExport = useCallback(async (selectedClips: Set<string>, mergeEnabled: boolean, mergeFileName?: string) => {
+    console.log(`[handleExport] selectedClips.size=${selectedClips.size} appState.clips.length=${appState.clips.length} IDs=[${[...selectedClips].slice(0, 3).join(',')}]`);
     if (selectedClips.size === 0) return;
 
     const selected = appState.clips.filter((c: ClipItem) => selectedClips.has(c.id));
+    console.log(`[handleExport] matched ${selected.length} clips from store`);
     if (selected.length === 0) return;
 
-    // If no export directory is set, prompt the user to pick one first
     let dir = persistedState.exportDir;
     if (!dir) {
       const picked = await open({ directory: true, multiple: false });
@@ -232,7 +494,7 @@ export default function useImportExport(props?: ImportExportProps) {
       setLoading(true);
 
       const sep = dir.includes('\\') ? '\\' : '/';
-      const clipArray = selected.map((c: ClipItem) => c.src);
+      const clipArray = selected.flatMap((c: ClipItem) => c.mergedSrcs ?? [c.src]);
       const format = generalSettings.exportFormat || "mp4";
 
       props?.onRPCUpdate?.({
@@ -248,24 +510,14 @@ export default function useImportExport(props?: ImportExportProps) {
       if (mergeEnabled) {
         const baseName = mergeFileName || ((selected[0]?.originalName || "episode") + "_merged");
         const savePath = `${dir}${sep}${baseName}.${format}`;
-
-        await invoke("export_clips", {
-          clips: clipArray,
-          savePath: savePath,
-          mergeEnabled: mergeEnabled,
-        });
+        await invoke("export_clips", { clips: clipArray, savePath, mergeEnabled });
       } else {
         const firstClipPath = selected[0]?.src || "";
         const firstFile = firstClipPath.split(/[/\\]/).pop() || `episode_0000.${format}`;
         const firstStem = firstFile.replace(/\.[^/.]+$/, "");
         const defaultBase = firstStem.replace(/_\d{4}$/, "");
         const savePath = `${dir}${sep}${defaultBase}_####.${format}`;
-
-        await invoke("export_clips", {
-          clips: clipArray,
-          savePath: savePath,
-          mergeEnabled: false,
-        });
+        await invoke("export_clips", { clips: clipArray, savePath, mergeEnabled: false });
       }
 
       props?.onRPCUpdate?.({
@@ -278,7 +530,6 @@ export default function useImportExport(props?: ImportExportProps) {
         buttons: generalSettings.rpcShowButtons,
       });
 
-      // Revert back to normal state after 10 seconds
       setTimeout(() => {
         props?.onRPCUpdate?.({
           type: "update",
@@ -291,7 +542,7 @@ export default function useImportExport(props?: ImportExportProps) {
         });
       }, 10000);
     } catch (err) {
-      console.log("Export failed:", err)
+      console.log("Export failed:", err);
     } finally {
       setLoading(false);
     }
@@ -316,12 +567,8 @@ export default function useImportExport(props?: ImportExportProps) {
       if (!savePath) return;
 
       setLoading(true);
-      await invoke("export_clips", {
-        clips: [clip.src],
-        savePath: savePath,
-        mergeEnabled: false,
-      });
-      console.log("Single clip download complete");
+      const srcs = clip.mergedSrcs ?? [clip.src];
+      await invoke("export_clips", { clips: srcs, savePath, mergeEnabled: srcs.length > 1 });
     } catch (err) {
       console.error("Single clip download failed:", err);
     } finally {
@@ -341,6 +588,6 @@ export default function useImportExport(props?: ImportExportProps) {
     handleExport,
     handlePickExportDir,
     handleBatchImport,
-    handleDownloadSingleClip
+    handleDownloadSingleClip,
   };
-}
\ No newline at end of file
+}
