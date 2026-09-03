import { useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FaImage } from "react-icons/fa";

import { useGeneralSettingsStore } from "../../../stores/settingsStore";

const ACCEPTED = ["png", "jpg", "jpeg", "webp", "gif"];

/**
 * sets a Scenepack's cover image. accepts a drop or a file picker, and takes
 * GIFs as-is so an animated cover keeps animating; the file is copied into the
 * pack's own storage rather than referenced where it lies.
 */
export default function ScenepackThumbnailModal({
  scenepackId,
  currentThumbnail,
  onClose,
  onSaved,
}: {
  scenepackId: string;
  currentThumbnail: string | null;
  onClose: () => void;
  onSaved: (thumbnail: string | null) => void;
}) {
  // same storage root the other scenepack commands resolve against
  const episodesPath = useGeneralSettingsStore((s) => s.episodesPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  // the webview's own drop event carries no filesystem path, so the file has to
  // come from Tauri's drag-drop event instead
  useEffect(() => {
    let cancelled = false;

    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setDragging(true);
            return;
          }
          if (event.payload.type === "leave") {
            setDragging(false);
            return;
          }
          if (event.payload.type === "drop") {
            setDragging(false);
            const first = event.payload.paths[0];
            if (first) void save(first);
          }
        })
        .then((unlisten) => {
          if (cancelled) unlisten();
          else unlistenRef.current = unlisten;
        })
    );

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenepackId]);

  const save = async (sourcePath: string) => {
    const extension = sourcePath.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED.includes(extension)) {
      setError("Thumbnail must be a PNG, JPEG, WebP, or GIF image.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const stored = await invoke<string>("save_scenepack_thumbnail", {
        scenepackId,
        sourcePath,
        customPath: episodesPath || null,
      });
      onSaved(stored);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const browse = async () => {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Images", extensions: ACCEPTED }],
    });
    if (typeof picked === "string") void save(picked);
  };

  return (
    <div className="episode-modal-overlay" onClick={onClose}>
      <div className="episode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="episode-modal-title">Change Thumbnail</div>

        <button
          type="button"
          className={`scenepack-thumb-drop${dragging ? " is-dragging" : ""}`}
          onClick={browse}
          disabled={busy}
        >
          {currentThumbnail ? (
            <img
              className="scenepack-thumb-preview"
              src={convertFileSrc(currentThumbnail)}
              alt=""
              draggable={false}
            />
          ) : (
            <FaImage aria-hidden="true" className="scenepack-thumb-icon" />
          )}
          <span>
            {busy ? "Saving..." : "Drop an image here, or click to browse"}
          </span>
          <span className="scenepack-thumb-hint">PNG, JPEG, WebP, or GIF</span>
        </button>

        {error && <p className="events-error">{error}</p>}

        <div className="episode-modal-actions">
          <button type="button" className="episode-modal-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
