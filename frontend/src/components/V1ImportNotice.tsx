import { useState } from "react";
import { v1ImportSummary } from "../features/migration/importV1";
import { useEscapeToClose } from "./common/useEscapeToClose";

// banner image link (imgur etc.); empty or broken shows the placeholder
const BANNER_URL = "https://i.imgur.com/7g65E7d.jpeg";

/** shown once, on the launch that brought settings and episodes over from AMVerge 1 */
export function V1ImportNotice() {
  const [open, setOpen] = useState(v1ImportSummary !== null);
  const [bannerFailed, setBannerFailed] = useState(false);
  const close = () => setOpen(false);
  useEscapeToClose(close, open);
  if (!open || !v1ImportSummary) return null;

  const { episodes } = v1ImportSummary;
  return (
    <div className="v1-import-overlay" role="dialog" aria-modal="true" aria-labelledby="v1-import-title">
      <div className="v1-import-modal">
        {BANNER_URL && !bannerFailed ? (
          <img className="v1-import-banner" src={BANNER_URL} alt="" onError={() => setBannerFailed(true)} />
        ) : (
          <div className="v1-import-banner v1-import-banner--placeholder">
            <span>AMVerge V2</span>
          </div>
        )}

        <div className="v1-import-content">
          <h2 id="v1-import-title" className="v1-import-title">Welcome to AMVerge V2!</h2>
          <p className="v1-import-lead">The following features are now available:</p>

          <ul className="v1-import-list">
            <li>AI scene detection</li>
            <li>Scene searching</li>
            <li>Scene matching</li>
            <li>Scene pack creation</li>

            {episodes > 0 ? <li>{episodes} episode{episodes === 1 ? "" : "s"} in your library</li> : null}
          </ul>

          <p className="v1-import-note">
            As well as many other changes. All of the AI features are run locally, <br />you can turn them on in{" "}
            <strong>Settings › Features</strong>.
          </p>

          <button type="button" className="v1-import-confirm" onClick={close} autoFocus>
            Enjoy!
          </button>
        </div>
      </div>
    </div>
  );
}
