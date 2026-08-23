import React from "react";
import { FiDownload } from "react-icons/fi";

import Tooltip from "../common/Tooltip";

type DownloadButtonProps = {
  onClick: (e: React.MouseEvent) => void;
  loading?: boolean;
  tone?: "light" | "dark";
};

/**
 * A small download button designed to sit on a clip tile.
 * animated on hover for a premium feel.
 */
export const DownloadButton: React.FC<DownloadButtonProps> = ({ onClick, loading, tone = "light" }) => {
  return (
    // wrapper span: the button goes disabled while downloading, and a disabled
    // control fires no pointer events of its own
    <Tooltip content={loading ? "Downloading…" : "Download this clip"}>
      <span className="tooltip-anchor">
        <button
          className={`clip-download-btn ${loading ? "loading" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onClick(e);
          }}
          aria-label="Download this clip"
          disabled={loading}
        >
          <FiDownload className={`clip-download-icon download-tone-${tone}`} />
        </button>
      </span>
    </Tooltip>
  );
};
