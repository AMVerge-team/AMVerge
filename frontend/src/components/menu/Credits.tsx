import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { FaHeart, FaGithub, FaCodeBranch } from "../icons/animated";

type GithubContributor = {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  contributions: number;
};

const EXCLUDED_LOGINS = new Set(["0xkhaosoccured"]);

let contributorsCache: Promise<GithubContributor[]> | null = null;

function loadContributors(): Promise<GithubContributor[]> {
  if (!contributorsCache) {
    contributorsCache = invoke<GithubContributor[]>("fetch_github_contributors")
      .then((list) =>
        list.filter(
          (c) =>
            !c.login.endsWith("[bot]") &&
            !EXCLUDED_LOGINS.has(c.login.toLowerCase()),
        ),
      )
      .catch((err) => {
        // drop failed promise so reopening Credits retries later
        contributorsCache = null;
        throw err;
      });
  }
  return contributorsCache;
}

export default function Credits() {
  const [contributors, setContributors] = useState<GithubContributor[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    loadContributors()
      .then((list) => {
        if (active) setContributors(list);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="panel menu-panel credits-panel">
      <div className="credits-hero">
        <h2 className="about-hero-title">The People Behind AMVerge</h2>
        <p className="about-hero-subtitle">
          AMVerge is an open-source collaboration built by anime editors. It&apos;s intended to be a
          community tool, shaped and improved together through contributions and suggestions.
        </p>
      </div>

      <div className="credits-grid">
        <div className="about-card credits-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaCodeBranch /></span>
            <h4>Contributors</h4>
          </div>
          {error ? (
            <p className="about-card-text">
              Could not load contributors from GitHub right now. View the full list on{" "}
              <button
                type="button"
                className="info-tour-link"
                onClick={() => void open("https://github.com/AMVerge-team/AMVerge/graphs/contributors")}
              >
                GitHub
              </button>
              .
            </p>
          ) : contributors === null ? (
            <p className="about-card-text">Loading contributors from GitHub...</p>
          ) : (
            <div className="credits-team-grid">
              {contributors.map((member) => (
                <div
                  key={member.login}
                  className="credits-member-card"
                  onClick={() => void open(member.htmlUrl)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void open(member.htmlUrl);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <img
                    className="member-avatar"
                    src={member.avatarUrl}
                    alt={member.login}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="member-info">
                    <span className="member-name">{member.login}</span>
                    <span className="member-role">
                      {member.contributions} {member.contributions === 1 ? "commit" : "commits"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="about-card credits-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaHeart /></span>
            <h4>Contribute &amp; Community</h4>
          </div>
          <p className="about-card-text">
            Want to help improve AMVerge? Whether it&apos;s adding new features, fixing bugs, or testing on
            different hardware, all contributions are welcome.
          </p>
          <div className="about-links-group" style={{ marginTop: "auto" }}>
            <button
              className="about-link-btn github"
              onClick={(e) => {
                e.preventDefault();
                void open("https://github.com/AMVerge-team/AMVerge");
              }}
            >
              <FaGithub style={{ marginRight: 8, fontSize: "1.1rem" }} />
              Contribute on GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
