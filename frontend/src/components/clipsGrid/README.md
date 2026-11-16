# clipsGrid

`clipsGrid` renders the shared clip grid used across Home episodes, Scenepacks, and Scene Scout results.

---

## How Playback Stays Smooth

Mounting hundreds of video decoders at once—especially 10-bit HEVC files—will freeze or crash the webview. The grid avoids that by keeping decoders lazy and lightweight:

- **Viewport windowing (`useGridWindow.ts`):** Only renders tiles near the visible scroll window.
- **On-demand video mounting (`LazyClip.tsx`, `useClipVideoSource.ts`, `useClipStagger.ts`):** Tiles stay as lightweight poster images or animated WebPs until hovered or mounted sequentially by Preview All (`staggeredMountQueue.ts`).
- **Automatic proxies & range cuts (`proxyQueue.ts`):** If a source codec isn't playable directly in the browser, or if a Scene Scout result points to a slice inside a full episode, Rust generates a 480p H.264 preview clip on demand and prioritizes hovered tiles first.
- **Animated WebP queue (`webpQueue.ts`, `useWebpPreview.ts`):** Generates and caches lightweight 240p animated previews when running in WebP preview mode.

---

## Files

- `ClipsContainer.tsx` — Grid layout, keyboard/mouse multi-select (`Ctrl/Cmd`, `Shift`), drag/drop, and export/action integration
- `LazyClip.tsx` — Individual memoized clip tile (poster/WebP rendering, hover playback, proxy & cut state)
- `SelectionActionBar.tsx`, `AddToScenepackModal.tsx`, `ScenepackPickerMenu.tsx`, `DownloadButton.tsx` — Selection toolbar and scenepack/export actions
- `useClipVideoSource.ts`, `useClipVideoElement.ts`, `useClipStagger.ts`, `useGridWindow.ts`, `useWebpPreview.ts` — Playback source resolution, staggered mounting, virtualization, and WebP preview hooks
- `proxyQueue.ts`, `staggeredMountQueue.ts`, `webpQueue.ts` — Background queues for proxy transcoding, preview-all mounting, and WebP encoding
- `types.ts`, `clipFormat.ts`, `gridScroll.ts`, `useDownloadTone.ts` — Shared types, timestamp/label formatting, and scroll persistence
