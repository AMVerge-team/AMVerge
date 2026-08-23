import { useEffect, useMemo, useRef, useState } from "react";
import { FaChevronDown } from "react-icons/fa";
import Tooltip from "../common/Tooltip";
import { useThemeSettingsStore } from "../../stores/settingsStore";

// Shown immediately and with no permission prompt: common Windows/macOS faces
// plus popular downloads, filtered to the ones actually installed. The full
// system list needs the Local Font Access API, which requires a user gesture.
const CURATED_FONTS = [
  "Arial", "Arial Black", "Bahnschrift", "Calibri", "Cambria", "Candara",
  "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New", "Ebrima",
  "Franklin Gothic Medium", "Gabriola", "Gadugi", "Georgia", "Impact", "Ink Free",
  "Lucida Console", "Lucida Sans Unicode", "Malgun Gothic", "MS Gothic", "MV Boli",
  "Nirmala UI", "Palatino Linotype", "Segoe Print", "Segoe Script", "Segoe UI",
  "Sitka", "Sylfaen", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
  "Yu Gothic",
  "Helvetica", "Helvetica Neue", "Menlo", "Monaco", "Avenir", "Avenir Next",
  "Futura", "Gill Sans", "Optima", "Baskerville", "Didot", "American Typewriter",
  "Courier", "Geneva", "Palatino", "Hoefler Text", "Charter", "Andale Mono",
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Source Sans Pro", "Noto Sans", "Fira Code", "JetBrains Mono", "Cascadia Code",
  "Ubuntu", "Nunito",
];

let detectCtx: CanvasRenderingContext2D | null | undefined;

// A missing family falls back to the generic base and measures identically, so
// a width difference against both bases means the font is installed.
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
  const query = getQueryLocalFonts();
  if (!query) return [];
  const fonts = await query();
  return Array.from(new Set(fonts.map((f) => f.family)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export default function FontPicker() {
  const appFontFamily = useThemeSettingsStore((s) => s.appFontFamily);
  const setAppFontFamily = useThemeSettingsStore((s) => s.setAppFontFamily);

  const [fonts, setFonts] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [canLoadAll, setCanLoadAll] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFonts(curatedInstalledFonts());
    setCanLoadAll(getQueryLocalFonts() !== null);
  }, []);

  // closes on an outside click, same as the other dropdowns
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const handleLoadAll = async () => {
    setLoadingAll(true);
    try {
      const all = await queryAllFontFamilies();
      if (all.length) {
        setFonts(all);
        setCanLoadAll(false);
      }
    } catch {
      // permission denied - the curated list stands
    } finally {
      setLoadingAll(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? fonts.filter((f) => f.toLowerCase().includes(q)) : fonts;
  }, [fonts, query]);

  return (
    <div className="font-picker" ref={containerRef}>
      <button
        type="button"
        className="font-picker-trigger"
        onClick={() => setOpen((o) => !o)}
        style={{ fontFamily: appFontFamily ? `"${appFontFamily}"` : "var(--app-font)" }}
      >
        <span>{appFontFamily ?? "Default (Jersey 10)"}</span>
        <FaChevronDown className={`font-picker-caret${open ? " open" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="font-picker-body">
          <div className="font-picker-search-row">
            <input
              type="text"
              className="font-picker-search"
              placeholder="Search fonts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {canLoadAll && (
              // wrapper span: the button disables itself while loading
              <Tooltip content="List every font installed on this system">
                <span className="tooltip-anchor">
                  <button
                    type="button"
                    className="buttons font-picker-load-all"
                    onClick={handleLoadAll}
                    disabled={loadingAll}
                  >
                    {loadingAll ? "Loading..." : "Load all installed"}
                  </button>
                </span>
              </Tooltip>
            )}
          </div>

          <div className="font-picker-list">
            <button
              type="button"
              className={`font-picker-option${appFontFamily === null ? " active" : ""}`}
              onClick={() => setAppFontFamily(null)}
            >
              Default (Jersey 10)
            </button>

            {filtered.length === 0 ? (
              <p className="font-picker-empty">No fonts found</p>
            ) : (
              filtered.map((font) => (
                <button
                  key={font}
                  type="button"
                  className={`font-picker-option${appFontFamily === font ? " active" : ""}`}
                  style={{ fontFamily: `"${font}"` }}
                  onClick={() => setAppFontFamily(font)}
                >
                  {font}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
