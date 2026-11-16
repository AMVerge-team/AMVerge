import React from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { FaBolt, FaFolderOpen } from '../icons/animated';
import { CommandItem } from "./types";

type Props = {
  command: CommandItem | null;
};

export function CommandInspector({ command }: Props) {
  const { t } = useTranslation("shell");
  if (!command) {
    return (
      <div className="spotlight-inspector-empty">
        <FaBolt className="empty-bolt" />
        <span>{t("palette.inspector.empty")}</span>
      </div>
    );
  }

  const { preview } = command;

  return (
    <div className="spotlight-inspector-content">
      {preview?.thumbnail ? (
        <div className="inspector-media-banner">
          <img
            src={
              preview.thumbnail.startsWith("data:")
                ? preview.thumbnail
                : convertFileSrc(preview.thumbnail)
            }
            alt={command.title}
          />
          <div className="media-overlay-gradient" />
        </div>
      ) : (
        <div className="inspector-icon-hero">
          {React.createElement(command.icon, { className: "inspector-hero-icon" })}
        </div>
      )}

      <div className="inspector-details">
        <h3 className="inspector-title">{command.title}</h3>

        {preview?.metaLine2 && (
          <div className="inspector-path-box">
            <span className="path-label">{t("palette.inspector.target")}</span>
            <span className="path-text">{preview.metaLine2}</span>
          </div>
        )}

        {preview?.description && <p className="inspector-desc">{preview.description}</p>}
      </div>

      <div className="inspector-actions">
        <button type="button" className="inspector-btn-primary" onClick={() => command.action()}>
          <span>{t("palette.inspector.execute")}</span>
          <kbd className="action-key-pill">↵</kbd>
        </button>

        {preview?.filePath && (
          <button
            type="button"
            className="inspector-btn-secondary"
            onClick={() => void invoke("reveal_in_file_manager", { path: preview.filePath })}
          >
            <FaFolderOpen />
            <span>{t("palette.inspector.reveal")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
