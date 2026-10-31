import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { FaChevronDown, FaCommentDots, FaExternalLinkAlt, FaPlay, FaYoutube } from "react-icons/fa";

import resyncbotLogo from "../../assets/resources/resyncbot.png";
import sammieRotoLogo from "../../assets/resources/sammie-roto.png";
import animeclipsLogo from "../../assets/resources/animeclips.png";

type ResourceVideo = {
  title: string;
  /** any youtube link: watch?v=, youtu.be/, shorts/ or embed/ */
  url: string;
};

type Resource = {
  name: string;
  tagline: string;
  logo: string;
  url: string;
  details: string[];
  /** the AMVerge creator's own take, shown under the description; leave empty to hide it */
  devNote: string;
  videos: ResourceVideo[];
};

const RESOURCES: Resource[] = [
  {
    name: "ResyncBot",
    tagline: "Automatically resync edits in seconds with your friends",
    logo: resyncbotLogo,
    url: "https://www.resyncbot.app/",
    details: [
      "Used in 300+ servers with nearly 200,000 people, this is a discord bot made by the AMVerge creator that resyncs edits automatically in seconds. Using BPM & audio waveform analysis, you can automatically resync your edit to a desired one or roll a random one that would fit. ",
    ],
    devNote: "This was my first project, and probably the most fun one I've made, to my surprise it's still being used many times a day, and as a result I'll be maintaining this for as long as I can.",
    videos: [
      { title: "Introducing Resyncbot", url: "https://youtu.be/zV8PnmXrJCs" }
    ],
  },
  {
    name: "Sammie Roto",
    tagline: "AI masking trained on anime",
    logo: sammieRotoLogo,
    url: "https://github.com/Zarxrax/Sammie-Roto-2",
    details: [
      "Co-created by the developer of AMVerge's Scene Scout feature, this is a free, open source AI masking tool featuring object detection + removal, and an exclusive AI model trained on anime. So good that it even captures hair strands flawlessly (Adobe, take notes..)",
    ],
    devNote: "Quite literally the best rotobrush tool I have used, their anime model blew my mind. Would highly recommend this if you haven't tried it already.",
    videos: [
      { title: "Introducing Sammie-Roto", url: "https://www.youtube.com/watch?v=HWpdLjILhj0" }
    ],
  },
  {
    name: "animeclips.online",
    tagline: "Download anime clips quickly",
    logo: animeclipsLogo,
    url: "https://animeclips.online/",
    details: [
      "With over 450,000+ clips, this is the largest library and resource for high quality anime clips.",
    ],
    devNote: "This is a tool I've used for a while now if I can't find a download for an anime I'm looking to edit, and a website trusted by thousands of editors today. Highly recommend!",
    videos: [
      { title: "how to get anime clips for edits", url: "https://youtu.be/uC2ipIQKmkY" }
    ],
  },
];

function youtubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([\w-]{11})/);
  return match ? match[1] : null;
}

const YT_ORIGIN = "https://www.youtube-nocookie.com";

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
          <button type="button" className="resource-video-poster" onClick={() => setPlaying(true)} aria-label={`Play ${video.title}`}>
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
          Watch on YouTube
        </button>
      </div>
    </div>
  );
}

export default function Resources() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="panel menu-panel resources-panel">
      <div className="credits-hero">
        <h2 className="about-hero-title">Resources</h2>
        <p className="about-hero-subtitle">Free, noteworthy tools made by the AMV community</p>
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
                  <span className="resource-tagline">{resource.tagline}</span>
                </span>
                <FaChevronDown className="resource-chevron" aria-hidden="true" />
              </button>

              {isOpen && (
                <div className="resource-body">
                  {resource.details.map((line) => (
                    <p key={line} className="about-card-text">{line}</p>
                  ))}

                  {resource.devNote && (
                    <div className="resource-dev-note">
                      <span className="resource-dev-note-label">
                        <FaCommentDots aria-hidden="true" />
                        Dev note
                      </span>
                      <p className="about-card-text">{resource.devNote}</p>
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
                    Visit {resource.name}
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
