import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaCopy, FaTrashAlt, FaSearch } from '../icons/animated';
import Tooltip from "../common/Tooltip";
import {
  clearConsoleLogs,
  serializeConsoleLogs,
  subscribeToConsoleLogs,
  type ConsoleEntry,
} from "../../utils/appConsole";

export default function Console() {
  const { t } = useTranslation("menu");
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "info" | "warn" | "error">("all");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return subscribeToConsoleLogs(setLogs);
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (levelFilter !== "all" && log.level !== levelFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          log.message.toLowerCase().includes(query) ||
          log.source.toLowerCase().includes(query) ||
          log.level.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [logs, searchQuery, levelFilter]);

  const consoleText = useMemo(() => {
    return serializeConsoleLogs(filteredLogs);
  }, [filteredLogs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredLogs]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(consoleText || t("console.noLogsCopy"));
  };

  const handleClear = () => {
    clearConsoleLogs();
  };

  return (
    <section className="panel menu-panel console-panel">
      <div className="console-header">
        <div>
          <h3>{t("console.title")}</h3>
          <p>{t("console.subtitle")}</p>
        </div>

        <div className="console-controls-bar">
          <div className="console-search-box">
            <FaSearch className="console-search-icon" />
            <input
              type="text"
              placeholder={t("console.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="console-search-input"
            />
          </div>

          <div className="console-filter-group">
            {(["all", "info", "warn", "error"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                className={`console-filter-btn ${levelFilter === lvl ? "active" : ""} ${lvl}`}
                onClick={() => setLevelFilter(lvl)}
              >
                {t(`console.levels.${lvl}`)}
              </button>
            ))}
          </div>

          <div className="console-actions">
            <Tooltip content={t("console.copyTooltip")}>
              <button
                className="console-action-icon"
                type="button"
                onClick={handleCopy}
                aria-label={t("console.copyLabel")}
              >
                <FaCopy aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip content={t("console.clearTooltip")}>
              <button
                className="console-action-icon clear"
                type="button"
                onClick={handleClear}
                aria-label={t("console.clearLabel")}
              >
                <FaTrashAlt aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="console-output">
        {filteredLogs.length === 0 ? (
          <div className="console-empty">
            <span>{t("console.empty")}</span>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className={`console-line console-line-${log.level}`}
            >
              <div className="console-line-meta">
                <span className={`console-level-badge level-${log.level}`}>
                  {log.level.toUpperCase()}
                </span>
                <span className="console-time">{log.time}</span>
                <span className="console-source">[{log.source}]</span>
              </div>
              <span className="console-message">{log.message}</span>
            </div>
          ))
        )}

        <div ref={bottomRef} />
      </div>
    </section>
  );
}
