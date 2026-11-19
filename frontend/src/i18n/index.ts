import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { create } from "zustand";
import {
    readLanguagePreference,
    resolveLanguage,
    writeLanguagePreference,
    SUPPORTED_LANGUAGES,
    type LanguagePreference,
    type ResolvedLanguage,
} from "./language";

export * from "./language";

type Resources = Record<string, Record<string, Record<string, unknown>>>;

// every locales/<lang>/<namespace>.json is bundled; no remote loading
const modules = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*/*.json", { eager: true });

export function collectResources(): Resources {
    const resources: Resources = {};
    for (const [path, mod] of Object.entries(modules)) {
        const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
        if (!match) continue;
        const [, lang, ns] = match;
        (resources[lang] ??= {})[ns] = mod.default;
    }
    return resources;
}

const resources = collectResources();
export const NAMESPACES = Object.keys(resources.en ?? {});

type LanguageState = {
    preference: LanguagePreference;
    language: ResolvedLanguage;
    setPreference: (preference: LanguagePreference) => void;
};

export const useLanguageStore = create<LanguageState>((set) => ({
    preference: "system",
    language: "en",
    setPreference: (preference) => {
        writeLanguagePreference(preference);
        const language = resolveLanguage(preference);
        set({ preference, language });
        void applyLanguage(language);
    },
}));

async function applyLanguage(language: ResolvedLanguage) {
    if (typeof document !== "undefined") document.documentElement.lang = language;
    if (i18n.language !== language) await i18n.changeLanguage(language);
}

let initialized = false;

/** runs before the first render so the first frame is already in the right language */
export function initI18n() {
    if (initialized) return i18n;
    initialized = true;

    const preference = readLanguagePreference();
    const language = resolveLanguage(preference);
    useLanguageStore.setState({ preference, language });
    if (typeof document !== "undefined") document.documentElement.lang = language;

    void i18n.use(initReactI18next).init({
        resources,
        lng: language,
        fallbackLng: "en",
        supportedLngs: [...SUPPORTED_LANGUAGES],
        ns: NAMESPACES,
        defaultNS: "common",
        fallbackNS: "common",
        // react escapes on render; strings are never treated as html
        interpolation: { escapeValue: false },
        returnNull: false,
        initAsync: false,
        missingKeyHandler: import.meta.env.DEV
            ? (lngs, ns, key) => console.warn(`[i18n] missing key ${ns}:${key} (${lngs.join(",")})`)
            : undefined,
        saveMissing: import.meta.env.DEV,
        react: { useSuspense: false },
    });

    // "follow system" re-resolves when the webview reports a new system language
    if (typeof window !== "undefined") {
        window.addEventListener("languagechange", () => {
            const { preference } = useLanguageStore.getState();
            if (preference !== "system") return;
            const next = resolveLanguage("system");
            useLanguageStore.setState({ language: next });
            void applyLanguage(next);
        });
    }

    return i18n;
}

/** translate outside react (notices, stores, module helpers); reads the current language at call time */
export function t(key: string, options?: Record<string, unknown>): string {
    return i18n.t(key, options as never) as unknown as string;
}

export function currentLanguage(): ResolvedLanguage {
    return useLanguageStore.getState().language;
}

export default i18n;
