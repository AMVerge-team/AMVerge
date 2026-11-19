# Translating AMVerge UI (en / zh-CN)

Infrastructure lives in `src/i18n/` (i18next + react-i18next, already installed and initialised in `main.tsx` before first render).

## Resources

- `src/i18n/locales/en/<namespace>.json` and `src/i18n/locales/zh-CN/<namespace>.json` are auto-loaded (Vite glob). A new namespace = a new pair of JSON files, nothing else to register.
- Both files must have exactly the same key set. English is the fallback.
- Nest keys by component/area, e.g. `"episodePanel": { "rename": "Rename" }`.
- `common` namespace (shared: OK, Cancel, Save, Close, Delete, Rename, Reset, Search, Loading..., etc.) is read-only for contributors; reference it as `t("common:cancel")`.

## Usage

In components:

```tsx
import { useTranslation } from "react-i18next";
const { t } = useTranslation("library");
t("episodePanel.rename");
t("selection.count", { count: n }); // plurals
```

Outside React (stores, notices, helpers, module-level code):

```ts
import { t } from "../i18n"; // adjust relative path; this t reads the current language at call time
```

Rules:

1. Never translate at module load. Module-level arrays of options/labels (`const OPTIONS = [{label: "Off"}]`) must become functions called during render (e.g. `getOptions()` / `useOptions()`), or keep a `labelKey` and translate at render. Otherwise switching language will not update them.
2. Translate only display text: labels, descriptions, tooltips, placeholders, `aria-label`, `title`, button text, notice/confirm text, empty states. NEVER change values, IDs, enum values, preset IDs, storage keys, IPC/invoke args, event names, file names, CSS classes, or console/log messages (leave `console.*` in English).
3. Dynamic sentences use full templates with params: `"Selected {{count}} clips"`. Never concatenate translated fragments. Plurals: English uses `key_one` / `key_other` with `{ count }`; Chinese only needs `key_other` (provide it, and a `key_one` too is harmless — keep key sets identical by providing both `_one` and `_other` in BOTH languages).
4. Interpolated values are plain text (escapeValue is off because React escapes). For text with inline JSX (bold, links) use `<Trans>` from react-i18next or split into separate keys rendered around the JSX element.
5. Brand/model/codec names stay as-is: AMVerge, Discord, DaVinci Resolve, TransNetV2, SigLIP 2, H.264, HEVC, ProRes, WebP, GPU, NVIDIA, FFmpeg.
6. File names, paths, user episode/folder/preset names are never translated.
7. Keep Chinese short in buttons; longer explanations are fine in descriptions/InfoButton bodies.
8. Use Chinese full-width punctuation (，。：？！“”（）) in zh-CN strings; ellipsis as `…`.

## Terminology (zh-CN)

| English | 中文 |
| --- | --- |
| Library | 素材库 |
| Episode | 视频（剧集语境用“剧集”） |
| Episode Panel | 视频面板 |
| Clip | 片段 |
| Scene | 场景 |
| Scenepack | 片段集 |
| Scene Scout | 场景搜索（Scene Scout） |
| Scene Detection | 场景检测 |
| Keyframe | 关键帧 |
| Export profile / preset | 导出预设 |
| Depth map | 深度图 |
| Upscaling | 超分辨率 |
| Preview | 预览 |
| Import / Export | 导入 / 导出 |
| Settings / General / Export / Appearance / Features | 设置 / 常规 / 导出 / 外观 / 功能 |
| Folder | 文件夹 |
| Merge | 合并 |
| Re-encode | 重新编码 |
| Storage | 存储 |
| Grid | 网格 |
| Tile | 磁贴 / 片段卡片 |
| Events (community) | 社区活动 |
| Tools | 工具 |
| Post-export passes | 导出后处理 |
