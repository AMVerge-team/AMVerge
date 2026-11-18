// language preference, kept apart from the theme so "reset appearance" never touches it

export type LanguagePreference = "system" | "en" | "zh-CN" | "fr-FR";
export type ResolvedLanguage = "en" | "zh-CN" | "fr-FR";

export const SUPPORTED_LANGUAGES: readonly ResolvedLanguage[] = ["en", "zh-CN", "fr-FR"];
export const LANGUAGE_STORAGE_KEY = "amverge.language.v1";

export function isLanguagePreference(value: unknown): value is LanguagePreference {
    return value === "system" || SUPPORTED_LANGUAGES.includes(value as ResolvedLanguage);
}

/** locale codes are crowdin's, so a folder here is the language crowdin writes to */
export function resolveSystemLanguage(locales: readonly string[] | undefined): ResolvedLanguage {
    for (const locale of locales ?? []) {
        if (typeof locale !== "string" || !locale) continue;
        const tag = locale.toLowerCase();
        if (tag.startsWith("zh")) return "zh-CN";
        if (tag.startsWith("fr")) return "fr-FR";
        return "en";
    }
    return "en";
}

export function systemLocales(): string[] {
    if (typeof navigator === "undefined") return [];
    const list = navigator.languages?.length ? [...navigator.languages] : [];
    if (!list.length && navigator.language) list.push(navigator.language);
    return list;
}

export function resolveLanguage(
    preference: LanguagePreference,
    locales: readonly string[] | undefined = systemLocales(),
): ResolvedLanguage {
    return preference === "system" ? resolveSystemLanguage(locales) : preference;
}

// held in memory too, so a session whose storage fails still keeps the choice
let sessionPreference: LanguagePreference | null = null;

export function readLanguagePreference(): LanguagePreference {
    if (sessionPreference) return sessionPreference;
    try {
        const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            const value = typeof parsed === "object" && parsed !== null
                ? (parsed as { preference?: unknown }).preference
                : parsed;
            if (isLanguagePreference(value)) return value;
        }
    } catch {
        // unreadable or invalid storage falls back to following the system
    }
    return "system";
}

export function writeLanguagePreference(preference: LanguagePreference) {
    sessionPreference = preference;
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify({ preference }));
    } catch (err) {
        console.warn("[i18n] could not save the language preference", err);
    }
}
