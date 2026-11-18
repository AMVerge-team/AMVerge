import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useTranslation } from "react-i18next";
import { FaChevronDown, FaCommentDots, FaExternalLinkAlt, FaPlay, FaYoutube } from '../icons/animated';

import resyncbotLogo from "../../assets/resources/resyncbot.png";
import sammieRotoLogo from "../../assets/resources/sammie-roto.png";
import animeclipsLogo from "../../assets/resources/animeclips.png";
import hyettaLogo from "../../assets/resources/hyetta.png";

type ResourceVideo = {
  title: string;
  /** any youtube link: watch?v=, youtu.be/, shorts/ or embed/ */
  url: string;
};

type Resource = {
  /** key under menu:resources.items holding tagline, details and devNote */
  id: string;
  name: string;
  logo: string;
  url: string;
  /** the AMVerge creator's own take, shown under the description */
  hasDevNote: boolean;
  videos: ResourceVideo[];
};

const RESOURCES: Resource[] = [
  {
    id: "resyncbot",
    name: "ResyncBot",
    logo: resyncbotLogo,
    url: "https://www.resyncbot.app/",
    hasDevNote: true,
    videos: [
      { title: "Introducing Resyncbot", url: "https://youtu.be/zV8PnmXrJCs" }
    ],
  },
  {
    id: "sammieRoto",
    name: "Sammie Roto",
    logo: sammieRotoLogo,
    url: "https://github.com/Zarxrax/Sammie-Roto-2",
    hasDevNote: true,
    videos: [
      { title: "Introducing Sammie-Roto", url: "https://www.youtube.com/watch?v=HWpdLjILhj0" }
    ],
  },
  {
    id: "animeclips",
    name: "animeclips.online",
    logo: animeclipsLogo,
    url: "https://animeclips.online/",
    hasDevNote: true,
    videos: [
      { title: "how to get anime clips for edits", url: "https://youtu.be/uC2ipIQKmkY" }
    ],
  },
  {
    id: "hyetta",
    name: "Hyetta",
    logo: hyettaLogo,
    url: "https://hyetta.net/",
    hasDevNote: true,
    videos: [],
  },
];

function youtubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/);
  return match ? match[1] : null;
}

const YT_ORIGIN = "https://www.youtube-nocookie.com"

// the player ignores commands until it is ready, so volume is resent for a few seconds after load
function startAtHalfVolume(frame: HTMLIFrameElement) {
  const send = (msg: object) => frame.contentWindow?.postMessage(JSON.stringify(msg), YT_ORIGIN);
  let tries = 0;
  const timer = window.setInterval(() => {
    send({ event: "listening", id: 1 });
    send({ event: "command", func: "setVolume", args: [50] });
    if (++tries >= 10) window.clearInterval(timer);
  }, 300);
}

/** a thumbnail until clicked, so no youtube player loads until the user wants one */
function ResourceVideoCard({ video }: { video: ResourceVideo }) {
  const { t } = useTranslation("menu");
  const [playing, setPlaying] = useState(false);
  const id = youtubeId(video.url);
  if (!id) return null;

  return (
    <div className="resource-video">
      <div className="resource-video-frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&enablejsapi=1`}
            title={video.title}
            onLoad={(e) => startAtHalfVolume(e.currentTarget)}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            // youtube refuses to play without a referrer (error 153)
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button type="button" className="resource-video-poster" onClick={() => setPlaying(true)} aria-label={t("resources.play", { title: video.title })}>
            <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" />
            <span className="resource-video-play">
              <FaPlay aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      <div className="resource-video-meta">
        <span className="resource-video-title">{video.title}</span>
        <button
          type="button"
          className="resource-video-external"
          onClick={() => void open(`https://www.youtube.com/watch?v=${id}`)}
        >
          <FaYoutube aria-hidden="true" />
          {t("resources.watchOnYoutube")}
        </button>
      </div>
    </div>
  );
}

export default function Resources() {
  const { t } = useTranslation("menu");
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="panel menu-panel resources-panel">
      <div className="credits-hero">
        <h2 className="about-hero-title">{t("resources.title")}</h2>
        <p className="about-hero-subtitle">{t("resources.subtitle")}</p>
      </div>

      <div className="resources-list">
        {RESOURCES.map((resource) => {
          const isOpen = expanded === resource.name;
          return (
            <div key={resource.name} className={`about-card resource-card${isOpen ? " is-open" : ""}`}>
              <button
                type="button"
                className="resource-head"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : resource.name)}
              >
                <img className="resource-logo" src={resource.logo} alt="" />
                <span className="resource-titles">
                  <span className="resource-name">{resource.name}</span>
                  <span className="resource-tagline">{t(`resources.items.${resource.id}.tagline`)}</span>
                </span>
                <FaChevronDown className="resource-chevron" aria-hidden="true" />
              </button>

              {isOpen && (
                <div className="resource-body">
                  <p className="about-card-text">{t(`resources.items.${resource.id}.details`)}</p>

                  {resource.hasDevNote && (
                    <div className="resource-dev-note">
                      <span className="resource-dev-note-label">
                        <FaCommentDots aria-hidden="true" />
                        {t("resources.devNote")}
                      </span>
                      <p className="about-card-text">{t(`resources.items.${resource.id}.devNote`)}</p>
                    </div>
                  )}

                  {resource.videos.length > 0 && (
                    <div className="resource-videos">
                      {resource.videos.map((video) => (
                        <ResourceVideoCard key={video.url} video={video} />
                      ))}
                    </div>
                  )}

                  <button type="button" className="about-link-btn resource-visit" onClick={() => void open(resource.url)}>
                    <FaExternalLinkAlt aria-hidden="true" />
                    {t("resources.visit", { name: resource.name })}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
