import { useEffect, useMemo, useRef, useState } from "react";
import { FaCopy, FaTrashAlt, FaSearch } from "react-icons/fa";
import Tooltip from "../common/Tooltip";
import {
  clearConsoleLogs,
  serializeConsoleLogs,
  subscribeToConsoleLogs,
  type ConsoleEntry,
} from "../../utils/appConsole";

export default function Console() {
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
    await navigator.clipboard.writeText(consoleText || "No console logs yet.");
  };

  const handleClear = () => {
    clearConsoleLogs();
  };

  return (
    <section className="panel menu-panel console-panel">
      <div className="console-header">
        <div>
          <h3>Developer Console</h3>
          <p>Live application and background CLI diagnostics log.</p>
        </div>

        <div className="console-controls-bar">
          <div className="console-search-box">
            <FaSearch className="console-search-icon" />
            <input
              type="text"
              placeholder="Search logs..."
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
                {lvl.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="console-actions">
            <Tooltip content="Copy filtered logs">
              <button
                className="console-action-icon"
                type="button"
                onClick={handleCopy}
                aria-label="Copy Logs"
              >
                <FaCopy aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip content="Clear logs">
              <button
                className="console-action-icon clear"
                type="button"
                onClick={handleClear}
                aria-label="Clear Logs"
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
            <span>No logs found matching current filter.</span>
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
