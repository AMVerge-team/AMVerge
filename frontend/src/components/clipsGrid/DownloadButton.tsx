import React from "react";
import { FiDownload } from "react-icons/fi";

import Tooltip from "../common/Tooltip";

type DownloadButtonProps = {
  onClick: (e: React.MouseEvent) => void;
  loading?: boolean;
  tone?: "light" | "dark";
};

/** a small animated download button for a clip tile */
export const DownloadButton: React.FC<DownloadButtonProps> = ({ onClick, loading, tone = "light" }) => {
  return (
    // a disabled button fires no pointer events, so the tooltip measures this wrapper (which carries the corner placement)
    <Tooltip content={loading ? "Downloading…" : "Download this clip"}>
      <span className="tooltip-anchor clip-download-anchor">
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
