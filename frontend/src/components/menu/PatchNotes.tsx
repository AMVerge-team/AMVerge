import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import changelog from "../../data/CHANGELOG.md?raw";
import { FaChevronDown, FaArrowLeft, FaFileAlt } from "react-icons/fa";

type ReleaseSummary = {
  version: string;
  body: string;
};

// vite import glob to bundle all full update files from updates/*.md
const updateDocFiles = import.meta.glob("../../../../updates/*.md", {
  query: "?raw",
  eager: true,
}) as Record<string, { default: string } | string>;

export default function PatchNotes() {
  const [selectedDocVersion, setSelectedDocVersion] = useState<string | null>(null);

  // parse main summary list directly from CHANGELOG.md
  const releases = useMemo<ReleaseSummary[]>(() => {
    const sections: ReleaseSummary[] = [];
    const lines = changelog.split("\n");
    let currentVersion = "";
    let currentBody: string[] = [];

    for (const line of lines) {
      if (line.startsWith("# ") || line.startsWith("## ")) {
        if (currentVersion) {
          sections.push({
            version: currentVersion,
            body: currentBody.join("\n").trim(),
          });
        }
        currentVersion = line.replace(/^#+\s*/, "").trim();
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }

    if (currentVersion) {
      sections.push({
        version: currentVersion,
        body: currentBody.join("\n").trim(),
      });
    }

    return sections;
  }, []);

  // Map of full doc markdown content keyed by version name (e.g. "v2.0.1", "v2.0.0", "v1.2.1", "v1.0.0")
  const fullDocsByVersion = useMemo<Record<string, { filename: string; content: string }>>(() => {
    const map: Record<string, { filename: string; content: string }> = {};

    for (const [path, module] of Object.entries(updateDocFiles)) {
      const raw = typeof module === "string" ? module : module?.default || "";
      if (!raw.trim()) continue;

      const filename = path.split("/").pop() || "";
      const baseKey = filename.replace(/\.md$/i, "").toLowerCase();

      map[baseKey] = { filename, content: raw };
    }

    return map;
  }, []);

  // first release (latest) open by default, older ones closed
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    releases.forEach((r, idx) => {
      initial[r.version] = idx === 0;
    });
    return initial;
  });

  const toggleSection = (version: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [version]: !prev[version],
    }));
  };

  const getFullDocForVersion = (versionStr: string) => {
    const normalized = versionStr.toLowerCase().replace(/[^a-z0-9.]/g, "");
    // try exact match or prefix match (e.g. "v2.0.0 (Beta)" -> "v2.0.0")
    for (const [key, doc] of Object.entries(fullDocsByVersion)) {
      if (normalized.startsWith(key) || key.startsWith(normalized)) {
        return doc;
      }
    }
    return null;
  };

  if (selectedDocVersion) {
    const docData = getFullDocForVersion(selectedDocVersion);

    return (
      <section className="panel menu-panel patchnotes-panel">
        <div className="patchnotes-detail-view">
          <div className="patchnotes-detail-header">
            <button
              type="button"
              className="patchnotes-back-btn"
              onClick={() => setSelectedDocVersion(null)}
            >
              <FaArrowLeft style={{ marginRight: 8 }} />
              Back to Update Logs
            </button>
            <span className="patchnotes-detail-badge">
              updates/{docData?.filename || `${selectedDocVersion}.md`}
            </span>
          </div>

          <div className="patchnotes-detail-card">
            <ReactMarkdown>
              {docData?.content || `# ${selectedDocVersion}\n\nFull release notes document not found in updates/`}
            </ReactMarkdown>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel menu-panel patchnotes-panel">
      <div className="patchnotes-hero">
        <h2 className="about-hero-title">Update Logs</h2>
        <p className="about-hero-subtitle">
          Track features, engine changes, and bug fixes across AMVerge releases.
        </p>
      </div>

      <div className="patchnotes-collapsible-list">
        {releases.map((release) => {
          const isOpen = openSections[release.version] ?? false;
          const hasFullDoc = Boolean(getFullDocForVersion(release.version));

          return (
            <div
              key={release.version}
              className={`patchnotes-collapsible-item${isOpen ? " is-open" : ""}`}
            >
              <button
                type="button"
                className="patchnotes-collapsible-header"
                onClick={() => toggleSection(release.version)}
                aria-expanded={isOpen}
              >
                <div className="patchnotes-version-tag">
                  <span className="patchnotes-version-bullet" />
                  <span className="patchnotes-version-name">{release.version}</span>
                </div>
                <FaChevronDown
                  className={`patchnotes-collapsible-chevron${isOpen ? " is-open" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {isOpen && (
                <div className="patchnotes-collapsible-body">
                  <div className="patchnotes-markdown-content">
                    <ReactMarkdown>{release.body}</ReactMarkdown>
                  </div>

                  {hasFullDoc && (
                    <div className="patchnotes-doc-actions">
                      <button
                        type="button"
                        className="patchnotes-doc-btn"
                        onClick={() => setSelectedDocVersion(release.version)}
                      >
                        <FaFileAlt style={{ marginRight: 6 }} />
                        View Full Update Log
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}