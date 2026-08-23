import { useState } from "react";
import About from "../components/menu/About";
import Console from "../components/menu/Console";
import PatchNotes from "../components/menu/PatchNotes";
import Credits from "../components/menu/Credits";
import BugReport from "../components/menu/BugReport";
import {
  FaInfoCircle,
  FaTerminal,
  FaHistory,
  FaUsers,
  FaBug,
} from "react-icons/fa";

const PAGES = [
  { key: "about", label: "About", icon: FaInfoCircle },
  { key: "console", label: "Console", icon: FaTerminal },
  { key: "logs", label: "Update Logs", icon: FaHistory },
  { key: "credits", label: "Credits", icon: FaUsers },
  { key: "bugreport", label: "Report Bug", icon: FaBug },
];

export default function Menu() {
  const [activePage, setActivePage] = useState("about");

  return (
    <div className="menu-page">
      <div className="menu-header">
        <div className="menu-nav">
          {PAGES.map((page) => {
            const Icon = page.icon;
            const isActive = activePage === page.key;
            return (
              <button
                key={page.key}
                className={`menu-nav-btn${isActive ? " active" : ""}`}
                onClick={() => setActivePage(page.key)}
              >
                <Icon className="menu-nav-icon" />
                <span>{page.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="menu-content">
        <div className="menu-section">
          {activePage === "about" && <About />}
          {activePage === "console" && <Console />}
          {activePage === "logs" && <PatchNotes />}
          {activePage === "credits" && <Credits />}
          {activePage === "bugreport" && <BugReport />}
        </div>
      </div>
    </div>
  );
}