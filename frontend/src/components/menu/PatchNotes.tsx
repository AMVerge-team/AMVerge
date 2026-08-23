import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import changelog from "../../data/CHANGELOG.md?raw";
import { FaHistory, FaChevronDown } from "react-icons/fa";

type ReleaseEntry = {
  version: string;
  body: string;
};

export default function PatchNotes() {
  const releases = useMemo<ReleaseEntry[]>(() => {
    const sections: ReleaseEntry[] = [];
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

  // First release (latest) open by default, older ones closed
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

  return (
    <section className="panel menu-panel patchnotes-panel">
      <div className="patchnotes-hero">
        <div className="about-hero-badge">
          <FaHistory style={{ marginRight: 6 }} /> CHANGELOG
        </div>
        <h2 className="about-hero-title">Update Logs</h2>
        <p className="about-hero-subtitle">
          Track features, engine changes, and bug fixes across AMVerge releases.
        </p>
      </div>

      <div className="patchnotes-collapsible-list">
        {releases.map((release) => {
          const isOpen = openSections[release.version] ?? false;
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
                  <ReactMarkdown>{release.body}</ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}