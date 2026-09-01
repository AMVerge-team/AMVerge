import { open } from "@tauri-apps/plugin-shell";
import {
  FaQuestionCircle,
  FaWrench,
  FaKeyboard,
  FaGlobe,
  FaDiscord,
  FaGithub,
} from "react-icons/fa";

// navigator.platform is deprecated but still the only synchronous read here, and
// the Tauri OS plugin would be an async round trip for one label.
const IS_MAC = /mac/i.test(navigator.platform);

export default function About() {
  return (
    <section className="panel menu-panel about-panel">
      <div className="about-hero">
        <h2 className="about-hero-title">About AMVerge</h2>
        <p className="about-hero-subtitle">
          AMVerge makes scene selection easier. It splits an episode into every shot up front, so you skim a grid instead of scrubbing a timeline, then cut the clips you picked losslessly and send them straight to your editor.
        </p>
      </div>

      <div className="about-grid">
        {/* Card 1: Key Features */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaQuestionCircle /></span>
            <h4>What is AMVerge?</h4>
          </div>
          <p className="about-card-text">
            A clip cutter for anime editors. Give it an episode and it finds every
            shot change, then lays the whole thing out as a grid you can skim.
          </p>
          <p className="about-card-text">
            Click the scenes you want and it pulls them out of the source file
            without re-encoding, so the clips keep the quality of the original.
            They land in a folder ready to drag into After Effects, Premiere, or
            Resolve.
          </p>
          <p className="about-card-text">
            It doesn't edit anything for you or decide which scenes are good. It
            just takes out the part where you scrub through an episode hunting for
            the four seconds you remembered.
          </p>
        </div>

        {/* Card 2: Recommended Workflow */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaWrench /></span>
            <h4>Fast Workflow</h4>
          </div>
          <ol className="about-card-steps">
            <li>
              <span className="step-num">1</span>
              <div>
                <strong>Import:</strong> Drag & drop your video files (MP4, MKV, WebM, etc.).
              </div>
            </li>
            <li>
              <span className="step-num">2</span>
              <div>
                <strong>Select:</strong> Skim the grid and select the scenes you need. Use <code>Shift + Click</code> for ranges or <code>Ctrl + Click</code> for individual clips.
              </div>
            </li>
            <li>
              <span className="step-num">3</span>
              <div>
                <strong>Merge & Export:</strong> Pick an export profile (or enable Merge Clips to join sequences) and hit <strong>Export Now</strong>.
              </div>
            </li>
          </ol>
        </div>

        {/* Card 3: Shortcuts & Controls */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaKeyboard /></span>
            <h4>Navigation & Shortcuts</h4>
          </div>
          <div className="about-shortcuts-table">
            <div className="shortcut-row">
              <span className="shortcut-key">Single Click</span>
              <span className="shortcut-desc">Focus clip and play preview</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Ctrl + Click</span>
              <span className="shortcut-desc">Toggle individual clip selection</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Shift + Click</span>
              <span className="shortcut-desc">Select continuous clip range</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">{IS_MAC ? "Cmd + Scroll" : "Ctrl + Scroll"}</span>
              <span className="shortcut-desc">Adjust the number of grid columns</span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-key">Esc</span>
              <span className="shortcut-desc">Open quick navigation, or close what is open</span>
            </div>
          </div>
        </div>

        {/* Card 4: Community & Links */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaGlobe /></span>
            <h4>Community & Support</h4>
          </div>
          <p className="about-card-text">
            Join our community for bug reports, updates, feature requests, and to share your edits:
          </p>
          <div className="about-links-group">
            <button
              className="about-link-btn discord"
              onClick={() => void open("https://discord.gg/bmXjTgsAaN")}
            >
              <FaDiscord style={{ marginRight: 8, fontSize: "1.1rem" }} />
              Discord Community
            </button>
            <button
              className="about-link-btn github"
              onClick={() => void open("https://github.com/AMVerge-team/AMVerge")}
            >
              <FaGithub style={{ marginRight: 8, fontSize: "1.1rem" }} />
              GitHub
            </button>
          </div>
          <div className="about-author-note">
            <em>Originally created by <strong>Crptk</strong>. Maintained by the AMVerge Team.</em>
          </div>
        </div>
      </div>
    </section>
  );
}