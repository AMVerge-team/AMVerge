import React from "react";
import { FiDownload } from "react-icons/fi";

import Tooltip from "../common/Tooltip";

type DownloadButtonProps = {
  onClick: (e: React.MouseEvent) => void;
  loading?: boolean;
  tone?: "light" | "dark";
};

/**
 * a small download button designed to sit on a clip tile.
 * animated on hover for a premium feel.
 */
export const DownloadButton: React.FC<DownloadButtonProps> = ({ onClick, loading, tone = "light" }) => {
  return (
    // wrapper span: the button goes disabled while downloading, and a disabled
    // control fires no pointer events of its own. the wrapper is what the
    // tooltip measures, so it carries the corner placement, left in the flow it
    // would collapse to nothing at the tile's top-left and drag the bubble there
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
