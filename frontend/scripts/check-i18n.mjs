// check-i18n.mjs
//
// Verifies the translation resources and the language resolver:
//   - en and zh-CN have the same namespaces and the same keys
//   - every {{placeholder}} matches between the two languages
//   - no empty strings
//   - every t("ns:key") / t("key") literal used in src resolves to an English key
//   - system language resolution, preference parsing and storage fallbacks
//
//   node scripts/check-i18n.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import ts from "typescript";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = path.join(ROOT, "src", "i18n", "locales");
const errors = [];

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const langs = readdirSync(LOCALES).filter((d) => statSync(path.join(LOCALES, d)).isDirectory());
const data = {};
for (const lang of langs) {
  data[lang] = {};
  for (const file of readdirSync(path.join(LOCALES, lang)).filter((f) => f.endsWith(".json"))) {
    try {
      data[lang][file.replace(/\.json$/, "")] = flatten(JSON.parse(readFileSync(path.join(LOCALES, lang, file), "utf8")));
    } catch (err) {
      errors.push(`${lang}/${file}: invalid json (${err.message})`);
    }
  }
}

const placeholders = (s) => [...String(s).matchAll(/\{\{\s*([\w.]+)\s*(?:,[^}]*)?\}\}/g)].map((m) => m[1]).sort().join(",");
const en = data.en ?? {};
let keyCount = 0;
for (const lang of langs.filter((l) => l !== "en")) {
  const other = data[lang];
  for (const ns of new Set([...Object.keys(en), ...Object.keys(other)])) {
    if (!en[ns]) { errors.push(`${lang}/${ns}: namespace missing in en`); continue; }
    if (!other[ns]) { errors.push(`${lang}/${ns}: namespace missing`); continue; }
    for (const key of Object.keys(en[ns])) {
      keyCount++;
      if (!(key in other[ns])) errors.push(`${lang}/${ns}: missing key ${key}`);
      else if (placeholders(en[ns][key]) !== placeholders(other[ns][key]))
        errors.push(`${lang}/${ns}: placeholder mismatch in ${key}: en[${placeholders(en[ns][key])}] vs [${placeholders(other[ns][key])}]`);
    }
    for (const key of Object.keys(other[ns])) if (!(key in en[ns])) errors.push(`${lang}/${ns}: extra key ${key}`);
  }
}
for (const lang of langs) for (const [ns, keys] of Object.entries(data[lang]))
  for (const [key, v] of Object.entries(keys)) if (typeof v !== "string" || !v.trim()) errors.push(`${lang}/${ns}: empty value ${key}`);

// literal t("...") calls must point at an existing english key
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== "locales") walk(p, out); }
    else if (/\.(tsx?|mts)$/.test(f)) out.push(p);
  }
  return out;
}
const PLURAL = ["", "_one", "_other", "_zero", "_two", "_few", "_many"];
for (const file of walk(path.join(ROOT, "src"))) {
  const src = readFileSync(file, "utf8");
  const nsMatch = src.match(/useTranslation\(\s*["']([\w-]+)["']/);
  const defaultNs = nsMatch ? nsMatch[1] : "common";
  for (const m of src.matchAll(/\bt\(\s*["']([\w.:-]+)["']/g)) {
    let [ns, key] = m[1].includes(":") ? m[1].split(":") : [defaultNs, m[1]];
    const has = (n) => en[n] && PLURAL.some((s) => (key + s) in en[n]);
    // a key that is an object prefix (returnObjects) also counts
    const isPrefix = (n) => en[n] && Object.keys(en[n]).some((k) => k.startsWith(key + "."));
    if (!has(ns) && !has("common") && !isPrefix(ns))
      errors.push(`${path.relative(ROOT, file)}: unknown key ${ns}:${key}`);
  }
}

// language resolver behaviour
const languageSource = readFileSync(path.join(ROOT, "src", "i18n", "language.ts"), "utf8");
const { outputText } = ts.transpileModule(languageSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const lang = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
assert.equal(lang.resolveSystemLanguage(["zh-CN"]), "zh-CN");
assert.equal(lang.resolveSystemLanguage(["zh-Hans-CN", "en-US"]), "zh-CN");
assert.equal(lang.resolveSystemLanguage(["zh-TW"]), "zh-CN");
assert.equal(lang.resolveSystemLanguage(["en-US", "zh-CN"]), "en");
assert.equal(lang.resolveSystemLanguage(["fr-FR"]), "en");
assert.equal(lang.resolveSystemLanguage([]), "en");
assert.equal(lang.resolveSystemLanguage(undefined), "en");
assert.equal(lang.resolveLanguage("en", ["zh-CN"]), "en");
assert.equal(lang.resolveLanguage("zh-CN", ["en-US"]), "zh-CN");
assert.equal(lang.resolveLanguage("system", ["zh-CN"]), "zh-CN");
assert.equal(lang.isLanguagePreference("ja"), false);

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
assert.equal(lang.readLanguagePreference(), "system", "missing value defaults to system");
store.set(lang.LANGUAGE_STORAGE_KEY, "{not json");
assert.equal(lang.readLanguagePreference(), "system", "corrupt value defaults to system");
store.set(lang.LANGUAGE_STORAGE_KEY, JSON.stringify({ preference: "klingon" }));
assert.equal(lang.readLanguagePreference(), "system", "unknown value defaults to system");
store.set(lang.LANGUAGE_STORAGE_KEY, JSON.stringify({ preference: "zh-CN" }));
assert.equal(lang.readLanguagePreference(), "zh-CN");
globalThis.localStorage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
const originalWarn = console.warn;
const warnings = [];
try {
  console.warn = (...args) => warnings.push(args);
  lang.writeLanguagePreference("en");
} finally {
  console.warn = originalWarn;
}
assert.equal(warnings.length, 1, "failed storage writes report a warning");
assert.equal(lang.readLanguagePreference(), "en", "session keeps the choice when storage fails");

if (errors.length) {
  console.error(`i18n check failed (${errors.length}):\n  ` + errors.join("\n  "));
  process.exit(1);
}
console.log(`i18n check passed: ${langs.join(", ")} · ${Object.keys(en).length} namespaces · ${keyCount} keys`);
