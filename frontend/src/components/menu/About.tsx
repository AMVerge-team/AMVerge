import { open } from "@tauri-apps/plugin-shell";
import {
  FaBolt,
  FaRocket,
  FaKeyboard,
  FaGlobe,
  FaDiscord,
  FaGithub,
} from "react-icons/fa";

export default function About() {
  return (
    <section className="panel menu-panel about-panel">
      <div className="about-hero">
        <div className="about-hero-badge">FAST SCENE DETECTION FOR EDITORS</div>
        <h2 className="about-hero-title">About AMVerge</h2>
        <p className="about-hero-subtitle">
          AMVerge eliminates the tedious chore of manual scene selection. Skim full episodes at a glance, cut lossless clips in seconds, and import directly into your editing workflow.
        </p>
      </div>

      <div className="about-grid">
        {/* Card 1: Key Features */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaBolt /></span>
            <h4>Core Superpowers</h4>
          </div>
          <ul className="about-card-list">
            <li>
              <strong>Instant Visual Skimming:</strong> Every scene is rendered in an interactive, responsive grid so you can find key moments in seconds.
            </li>
            <li>
              <strong>AI & Keyframe Detection:</strong> Choose between blazingly fast keyframe splits (zero ML deps) or AI TransNetV2 neural cut detection.
            </li>
            <li>
              <strong>100% Lossless Smart Cuts:</strong> Clips are stream-copied losslessly with GOP-alignment, preserving original source bitrate and color.
            </li>
            <li>
              <strong>Editor Import Ready:</strong> Auto-converts and prepares MP4/MOV footage compatible with After Effects, Premiere, and DaVinci Resolve.
            </li>
          </ul>
        </div>

        {/* Card 2: Recommended Workflow */}
        <div className="about-card">
          <div className="about-card-header">
            <span className="about-card-icon"><FaRocket /></span>
            <h4>Fast-Track Workflow</h4>
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
                <strong>Select:</strong> Skim the grid and click the scenes you need. Use <code>Shift + Click</code> for ranges or <code>Ctrl + Click</code> for individual clips.
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
              <span className="shortcut-key">Grid Zoom</span>
              <span className="shortcut-desc">Adjust columns in titlebar</span>
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