import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useThemeSettingsStore } from "../../stores/settingsStore";

// Fallback list (common Windows/macOS fonts + popular downloads), shown
// immediately (no permission needed) and filtered to the ones actually installed
// via canvas width detection. The full system list is loaded on demand via the
// Local Font Access API, which requires a user gesture (the "Load all" button).
const CURATED_FONTS = [
  "Arial", "Arial Black", "Bahnschrift", "Calibri", "Cambria", "Candara",
  "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New", "Ebrima",
  "Franklin Gothic Medium", "Gabriola", "Gadugi", "Georgia", "Impact", "Ink Free",
  "Lucida Console", "Lucida Sans Unicode", "Malgun Gothic", "MS Gothic", "MV Boli",
  "Nirmala UI", "Palatino Linotype", "Segoe Print", "Segoe Script", "Segoe UI",
  "Sitka", "Sylfaen", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
  "Yu Gothic",
  // macOS
  "Helvetica", "Helvetica Neue", "Menlo", "Monaco", "Avenir", "Avenir Next",
  "Futura", "Gill Sans", "Optima", "Baskerville", "Didot", "American Typewriter",
  "Courier", "Geneva", "Palatino", "Hoefler Text", "Charter", "Andale Mono",
  // popular downloads
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Source Sans Pro", "Noto Sans", "Fira Code", "JetBrains Mono", "Cascadia Code",
  "Ubuntu", "Nunito",
];

let detectCtx: CanvasRenderingContext2D | null | undefined;

// Heuristic: a family is installed if it renders at a different width than both
// generic bases (a missing font falls back to the base and matches it exactly).
function isFontInstalled(family: string): boolean {
  if (detectCtx === undefined) {
    detectCtx = document.createElement("canvas").getContext("2d");
  }
  const ctx = detectCtx;
  if (!ctx) return true;
  const sample = "mmmmmmmmmmlliWQ0123456789";
  const measure = (f: string) => {
    ctx.font = `72px ${f}`;
    return ctx.measureText(sample).width;
  };
  return (
    measure(`"${family}", monospace`) !== measure("monospace") ||
    measure(`"${family}", serif`) !== measure("serif")
  );
}

function curatedInstalledFonts(): string[] {
  return Array.from(new Set(CURATED_FONTS.filter(isFontInstalled))).sort((a, b) =>
    a.localeCompare(b)
  );
}

type QueryLocalFonts = () => Promise<Array<{ family: string }>>;

function getQueryLocalFonts(): QueryLocalFonts | null {
  const fn = (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts;
  return typeof fn === "function" ? fn : null;
}

async function queryAllFontFamilies(): Promise<string[]> {
  const q = getQueryLocalFonts();
  if (!q) return [];
  const fonts = await q();
  return Array.from(new Set(fonts.map((f) => f.family)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export default function FontPicker() {
  const appFontFamily = useThemeSettingsStore((s) => s.appFontFamily);
  const setAppFontFamily = useThemeSettingsStore((s) => s.setAppFontFamily);

  const [fonts, setFonts] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  // Collapsed by default — acts like a dropdown; click the trigger to expand.
  const [open, setOpen] = useState(false);
  // Whether the full system list can be loaded (needs a user gesture to run).
  const [canLoadAll, setCanLoadAll] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  useEffect(() => {
    // Curated baseline is instant and needs no permission.
    setFonts(curatedInstalledFonts());
    setCanLoadAll(getQueryLocalFonts() !== null);
  }, []);

  const handleLoadAll = async () => {
    setLoadingAll(true);
    try {
      const all = await queryAllFontFamilies();
      if (all.length) {
        setFonts(all);
        setCanLoadAll(false);
      }
    } catch {
      // Permission denied — keep the curated list.
    } finally {
      setLoadingAll(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? fonts.filter((f) => f.toLowerCase().includes(q)) : fonts;
  }, [fonts, query]);

  const itemStyle = (active: boolean, family?: string): CSSProperties => ({
    textAlign: "left",
    padding: "6px 10px",
    borderRadius: 6,
    border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
    background: active ? "rgb(var(--accent-rgb) / 0.15)" : "transparent",
    color: active ? "var(--accent)" : "inherit",
    cursor: "pointer",
    fontSize: 18,
    fontFamily: family ? `"${family}"` : "var(--app-font)",
  });

  return (
    <div style={{ width: "100%", maxWidth: 460 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(0,0,0,0.3)",
          color: "inherit",
          cursor: "pointer",
          fontFamily: appFontFamily ? `"${appFontFamily}"` : "var(--app-font)",
          fontSize: 18,
        }}
      >
        <span>{appFontFamily ?? "Default (Jersey 10)"}</span>
        <span style={{ opacity: 0.6, fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Search fonts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(0,0,0,0.3)",
            color: "inherit",
            fontFamily: "var(--app-font)",
            boxSizing: "border-box",
          }}
        />
        {canLoadAll && (
          <button
            type="button"
            className="buttons"
            style={{ width: "auto", padding: "0 12px", marginBottom: 0, whiteSpace: "nowrap" }}
            onClick={handleLoadAll}
            disabled={loadingAll}
            title="List every font installed on this system"
          >
            {loadingAll ? "Loading…" : "Load all installed"}
          </button>
        )}
      </div>

      <div
        style={{
          maxHeight: 240,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: 6,
        }}
      >
        <button
          type="button"
          style={itemStyle(appFontFamily === null)}
          onClick={() => setAppFontFamily(null)}
        >
          Default (Jersey 10)
        </button>

        {filtered.length === 0 ? (
          <div style={{ padding: 10, opacity: 0.7 }}>No fonts found</div>
        ) : (
          filtered.map((f) => (
            <button
              key={f}
              type="button"
              style={itemStyle(appFontFamily === f, f)}
              onClick={() => setAppFontFamily(f)}
            >
              {f}
            </button>
          ))
        )}
      </div>
        </div>
      )}
    </div>
  );
}
