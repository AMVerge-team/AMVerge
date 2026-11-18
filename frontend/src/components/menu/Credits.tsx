import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("menu");
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
        <h2 className="about-hero-title">{t("menu:credits.title")}</h2>
        <p className="about-hero-subtitle">
          {t("credits.subtitle")}
        </p>
      </div>

      <div className="credits-grid">
        <div className="about-card credits-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaCodeBranch /></span>
            <h4>{t("menu:credits.contributors")}</h4>
          </div>
          {error ? (
            <p className="about-card-text">
              {t("release202:contributorsFailed")}{" "}
              <button
                type="button"
                className="info-tour-link"
                onClick={() => void open("https://github.com/AMVerge-team/AMVerge/graphs/contributors")}
              >
                {t("menu:about.community.github")}</button>
              .
            </p>
          ) : contributors === null ? (
            <p className="about-card-text">{t("release202:contributorsLoading")}</p>
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
                      {t("release202:commits", { count: member.contributions })}
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
            <h4>{t("credits.contribute")}</h4>
          </div>
          <p className="about-card-text">
            {t("credits.contributeText")}
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
              {t("menu:credits.contributeGithub")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
