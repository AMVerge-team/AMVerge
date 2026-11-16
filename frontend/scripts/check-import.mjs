import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadModule(file, mocks) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    console: { info() {}, error() {}, warn() {} },
    require(id) {
      assert.ok(id in mocks, `unexpected dependency ${id}`);
      return mocks[id];
    },
  }, { filename: file });
  return exports;
}

function setup() {
  const notices = [], errors = [], discarded = [];
  const abortedRef = { current: false };
  let language = "zh-CN";
  const locales = Object.fromEntries(["en", "zh-CN"].map((lang) => [lang,
    JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}/jobs.json`, import.meta.url), "utf8")),
  ]));
  const t = (key, options = {}) => {
    let parts = key.replace(/^jobs:/, "").split(".");
    if ("count" in options) parts[parts.length - 1] += options.count === 1 ? "_one" : "_other";
    const value = parts.reduce((v, part) => v?.[part], locales[language]);
    assert.equal(typeof value, "string", `missing ${language}:${key}`);
    return value.replace(/{{(\w+)}}/g, (_, name) => String(options[name]));
  };
  const { notifyImportFailure } = loadModule("features/import/importFailure.ts", {
    "../../i18n": { t },
    "../notice/notice": {
      errorText: (err) => err instanceof Error ? err.message : String(err),
      showNotice: (title, message) => { notices.push({ title, message }); return Promise.resolve(); },
    },
  });
  const app = { loading: false, activeOperation: null, clips: [], bgProgress: null };
  for (const field of ["Loading", "ActiveOperation", "BgImportProgress", "ImportToken", "BatchTotal", "BatchDone", "BatchCurrentFile", "Progress", "ProgressMsg", "SelectedClips", "FocusedClip", "FocusedClipId", "ImportedVideoPath", "VideoIsHEVC", "Clips"]) {
    const key = field[0].toLowerCase() + field.slice(1);
    app[`set${field}`] = (value) => { app[key] = value; };
  }
  const appStore = (selector) => selector(app);
  appStore.getState = () => app;
  appStore.setState = (patch) => Object.assign(app, patch);
  const episodes = {
    episodes: [], selectedFolderId: null,
    setEpisodes(updater) { this.episodes = updater(this.episodes); },
    setSelectedEpisodeId(id) { this.selectedEpisodeId = id; },
    setOpenedEpisodeId(id) { this.openedEpisodeId = id; },
  };
  const runtimeStore = () => episodes;
  runtimeStore.getState = () => episodes;
  const behavior = {
    claim: true,
    picker: async () => null,
    run: async (file, id) => ({ episodeEntry: { id, videoPath: file, clips: [{ id: `${id}_0`, clipPath: "/cut.mp4" }] }, sceneCount: 1 }),
  };
  let nextId = 0;
  const { useImportPipeline } = loadModule("hooks/useImportPipeline.ts", {
    react: { useCallback: (callback) => callback, useRef: (current) => ({ current }), startTransition: (callback) => callback() },
    "@tauri-apps/plugin-dialog": { open: () => behavior.picker() },
    "../i18n": { t },
    "../utils/episodeUtils": { fileNameFromPath: (f) => f.split("/").pop(), truncateFileName: (f) => f },
    "../features/import/manifest": { buildEpisodeCacheId: () => `episode_${++nextId}`, logImportError: (...args) => errors.push(args) },
    "../features/import/importPipeline": {
      discardEpisodeCache: (id) => discarded.push(id),
      hasLanded: (id) => episodes.episodes.some((ep) => ep.id === id && ep.clips.length > 0),
      runImportPipeline: (...args) => behavior.run(...args),
    },
    "../features/import/reencodeQueue": { queueReencode() {} },
    "../features/processes/singleProcess": { claimProcess: async () => behavior.claim },
    "../stores/appStore": { useAppStateStore: appStore },
    "../stores/episodeStore": { useEpisodePanelRuntimeStore: runtimeStore },
    "../stores/settingsStore": { useGeneralSettingsStore: () => ({ episodesPath: null, importMethod: "video_files", sceneDetectionMethod: "keyframe_detection" }) },
    "../utils/videoExtensions": { VIDEO_EXTENSIONS: ["mp4"] },
    "../features/import/importFailure": { notifyImportFailure },
  });
  return { ...useImportPipeline({ abortedRef }), app, episodes, notices, errors, discarded, abortedRef, behavior, setLanguage: (lang) => { language = lang; } };
}

const fail = async () => { throw "Failed to create episode cache directory '/storage/episodes': Operation not permitted (os error 1)"; };
{
  const s = setup(); s.behavior.run = fail;
  await s.handleImport("/video.mp4");
  assert.equal(s.notices.length, 1);
  assert.equal(s.notices[0].title, "视频导入失败");
  assert.match(s.notices[0].message, /目录权限/);
  assert.match(s.notices[0].message, /\/storage\/episodes/);
  assert.equal(s.discarded.length, 1);
  assert.equal(s.app.loading, false);
  assert.equal(s.app.activeOperation, null);
  assert.equal(s.episodes.episodes.length, 0);
}
{
  const s = setup(); await s.handleImport("/video.mp4");
  assert.equal(s.app.clips.length, 1);
  assert.equal(s.episodes.episodes.length, 1);
  assert.equal(s.notices.length, 0);
}
{
  const s = setup(); const success = s.behavior.run;
  s.setLanguage("en");
  s.behavior.run = (file, id) => file.includes("bad") ? fail() : success(file, id);
  await s.handleBatchImport(["/bad1.mp4", "/good.mp4", "/bad2.mp4"]);
  assert.equal(s.notices.length, 1);
  assert.equal(s.notices[0].title, "2 video imports failed");
  assert.match(s.notices[0].message, /folder permissions/);
  assert.equal(s.episodes.episodes.length, 1);
  assert.equal(s.app.clips.length, 1);
  assert.equal(s.app.loading, false);
  assert.equal(s.app.activeOperation, null);
}
for (const resolvesAfterAbort of [false, true]) {
  const s = setup(); const success = s.behavior.run;
  s.behavior.run = async (file, id) => { s.abortedRef.current = true; return resolvesAfterAbort ? success(file, id) : fail(); };
  await s.handleImport("/cancel.mp4");
  assert.equal(s.notices.length, 0);
  assert.equal(s.episodes.episodes.length, 0);
  assert.equal(s.discarded.length, 1);
  assert.equal(s.app.loading, false);
}
{
  const s = setup();
  s.behavior.run = async (file, id) => {
    s.episodes.setEpisodes(() => [{ id, videoPath: file, clips: [{ id: `${id}_0` }] }]);
    return fail();
  };
  await s.handleBatchImport(["/partial.mp4"]);
  assert.equal(s.episodes.episodes.length, 1);
  assert.equal(s.discarded.length, 0);
  assert.equal(s.notices.length, 1);
}
{
  const s = setup();
  s.behavior.picker = async () => { throw "File picker failed"; };
  await s.onImportClick();
  assert.equal(s.notices.length, 1);
  assert.match(s.notices[0].message, /File picker failed/);
}
{
  const s = setup(); s.behavior.claim = false;
  await s.handleImport("/video.mp4");
  assert.equal(s.episodes.episodes.length, 0);
  assert.equal(s.notices.length, 0);
}
console.log("import check passed: success, permission errors, batch recovery, cancellation, picker errors, process conflicts");
