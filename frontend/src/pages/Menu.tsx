import { useState } from "react";
import { useTranslation } from "react-i18next";
import About from "../components/menu/About";
import Console from "../components/menu/Console";
import PatchNotes from "../components/menu/PatchNotes";
import Credits from "../components/menu/Credits";
import BugReport from "../components/menu/BugReport";
import Resources from "../components/menu/Resources";
import { useTabKeys } from "../components/common/useTabKeys";
import { FaInfoCircle, FaTerminal, FaHistory, FaUsers, FaBug, FaToolbox } from '../components/icons/animated';

const PAGES = [
  { key: "about", icon: FaInfoCircle },
  { key: "console", icon: FaTerminal },
  { key: "logs", icon: FaHistory },
  { key: "credits", icon: FaUsers },
  { key: "resources", icon: FaToolbox },
  { key: "bugreport", icon: FaBug },
];

export default function Menu() {
  const { t } = useTranslation("shell");
  const [activePage, setActivePage] = useState("about");
  useTabKeys(PAGES.map((page) => page.key), activePage, setActivePage);

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
                <span>{t(`menuPage.tabs.${page.key}`)}</span>
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
          {activePage === "resources" && <Resources />}
          {activePage === "bugreport" && <BugReport />}
        </div>
      </div>
    </div>
  );
}