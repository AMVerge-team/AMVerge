import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FaFolderOpen, FaSyncAlt, FaTrashAlt, FaCheck, FaPalette } from "react-icons/fa";
import { useThemeSettingsStore } from "../../stores/settingsStore";
import {
  deleteTheme,
  listThemes,
  openThemesFolder,
  type Theme,
} from "../../features/theme/themes";

export default function ThemesSection() {
  const themeId = useThemeSettingsStore((s) => s.themeId);
  const setThemeSettings = useThemeSettingsStore.setState;

  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setThemes(await listThemes());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const isHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

  const selectTheme = (id: string | null) => {
    if (!id) {
      setThemeSettings((prev) => ({ ...prev, themeId: null }));
      return;
    }
    const theme = themes.find((t) => t.id === id);
    if (!theme) return;
    setThemeSettings((prev) => {
      const next: Partial<typeof prev> = { themeId: id };
      if (theme.vars["--accent"] && isHex(theme.vars["--accent"])) {
        next.accentColor = theme.vars["--accent"];
      }
      if (theme.vars["--bg-accent"] && isHex(theme.vars["--bg-accent"])) {
        next.backgroundGradientColor = theme.vars["--bg-accent"];
      }
      return { ...prev, ...next };
    });
  };

  const handleDelete = async (theme: Theme) => {
    if (!theme.path) return;
    try {
      await deleteTheme(theme.path);
      if (themeId === theme.id) {
        setThemeSettings((prev) => ({ ...prev, themeId: null }));
      }
      await refresh();
    } catch (err) {
      window.alert("Failed to delete theme: " + String(err));
    }
  };

  const thumbnail = (theme: Theme) =>
    theme.thumbnail ? convertFileSrc(theme.thumbnail) : null;

  return (
    <section className="panel menu-panel settings-panel">
      <h3>Themes</h3>
      <div className="about-content">
        <div className="themes-toolbar">
          <button className="buttons" type="button" onClick={() => void openThemesFolder()}>
            <FaFolderOpen /> Open Folder
          </button>
          <button className="buttons" type="button" onClick={() => void refresh()} disabled={loading}>
            <FaSyncAlt /> Reload
          </button>
          <span className="themes-hint">
            Drop theme folders (theme-info.json + .css + thumbnail) into the themes folder.
          </span>
        </div>

        {error ? <p className="pxm-errors">{error}</p> : null}

        <div className="themes-grid">
          <div
            className={`theme-card${themeId === null ? " is-selected" : ""}`}
            onClick={() => selectTheme(null)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && selectTheme(null)}
          >
            <div className="theme-card-thumb theme-card-thumb-default">
              <FaPalette />
            </div>
            <div className="theme-card-body">
              <div className="theme-card-title">Default</div>
              <div className="theme-card-author">AMVerge</div>
              <div className="theme-card-desc">The built-in look.</div>
            </div>
            {themeId === null && (
              <span className="theme-card-check">
                <FaCheck />
              </span>
            )}
          </div>

          {themes.map((theme) => {
            const thumb = thumbnail(theme);
            return (
              <div
                key={theme.id}
                className={`theme-card${themeId === theme.id ? " is-selected" : ""}`}
                onClick={() => selectTheme(theme.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && selectTheme(theme.id)}
              >
                <div className="theme-card-thumb">
                  <span className="theme-card-thumb-swatch" style={{ background: theme.vars["--accent"] ?? "var(--accent)" }} />
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={theme.name}
                      draggable={false}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : null}
                </div>
                <div className="theme-card-body">
                  <div className="theme-card-title">{theme.name}</div>
                  <div className="theme-card-author">
                    {theme.author ? `by ${theme.author}` : "Unknown author"}
                  </div>
                  <div className="theme-card-desc">{theme.description || ""}</div>
                  <div className="theme-card-meta">
                    {theme.cssFiles?.length ?? 0} css file{(theme.cssFiles?.length ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
                {themeId === theme.id && (
                  <span className="theme-card-check">
                    <FaCheck />
                  </span>
                )}
                {theme.path ? (
                  <button
                    type="button"
                    className="theme-card-delete"
                    title="Delete theme"
                    aria-label={`Delete ${theme.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(theme);
                    }}
                  >
                    <FaTrashAlt />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {!loading && themes.length === 0 && (
          <p className="themes-empty">No themes found. Open the folder and drop one in.</p>
        )}
      </div>
    </section>
  );
}
