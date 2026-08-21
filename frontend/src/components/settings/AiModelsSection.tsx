import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import SettingRow from "../common/SettingRow";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import {
  formatBytes,
  isPackInstalled,
  type AiPackId,
} from "../../features/aiDeps/packs";

type ModelInfo = {
  key: string;
  name: string;
  method: string;
  file: string;
  sizeBytes: number;
  downloaded: boolean;
};

type ModelsList = {
  depth: ModelInfo[];
  interpolation: ModelInfo[];
};

type ActionResult = {
  ok: boolean;
  action: string;
  key: string;
  message: string;
};

type Category = "depth" | "interpolation";

const CATEGORY_PACK: Record<Category, AiPackId> = {
  depth: "depth",
  interpolation: "interpolation",
};

const CATEGORY_TITLE: Record<Category, string> = {
  depth: "Depth Models",
  interpolation: "Interpolation Models",
};

/**
 * AI model weight manager. Lists depth + interpolation models from the CLI and
 * lets the user download or delete them. Each category is gated on its AI pack
 * being installed.
 */
export default function AiModelsSection() {
  const aiStatus = useAiDepsStore((s) => s.status);
  const [models, setModels] = useState<ModelsList | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const depthInstalled = isPackInstalled(aiStatus, "depth");
  const interpInstalled = isPackInstalled(aiStatus, "interpolation");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<ModelsList>("list_models");
      setModels(data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, depthInstalled, interpInstalled]);

  const act = async (key: string, kind: "download" | "delete") => {
    setBusyKey(`${kind}:${key}`);
    setError(null);
    try {
      const res = await invoke<ActionResult>(
        kind === "download" ? "download_model" : "delete_model",
        { key },
      );
      if (!res.ok) setError(res.message);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyKey(null);
      await load();
    }
  };

  const renderGroup = (category: Category) => {
    const installed = category === "depth" ? depthInstalled : interpInstalled;
    const list = models?.[category] ?? [];

    return (
      <div key={category}>
        <SettingRow
          label={CATEGORY_TITLE[category]}
          description={
            installed
              ? "Model weights used by this feature. Download them ahead of time."
              : `Install the ${CATEGORY_PACK[category]} feature in AI Packs to manage its models.`
          }
          control={
            installed ? (
              <span className="settings-value" style={{ width: "auto" }}>
                {list.length} model{list.length === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="aid-state">Not available</span>
            )
          }
        />
        {installed && list.map((model) => renderModel(model, true))}
      </div>
    );
  };

  const renderModel = (model: ModelInfo, enabled: boolean) => {
    const busy = busyKey !== null;
    const isBusy =
      busyKey === `download:${model.key}` || busyKey === `delete:${model.key}`;

    return (
      <div
        key={model.key}
        className="aid-pack-row"
        style={{ justifyContent: "space-between", opacity: enabled ? 1 : 0.5 }}
      >
        <span className="settings-value" style={{ width: "auto", flex: 1, minWidth: 0 }}>
          <span className="episode-panel-episode-name">{model.name}</span>
          <span className="settings-value" style={{ width: "auto", opacity: 0.6, marginLeft: 8 }}>
            {model.sizeBytes > 0 ? formatBytes(model.sizeBytes) : "—"}
          </span>
        </span>
        <span className={`aid-state${model.downloaded ? " installed" : ""}`}>
          {model.downloaded ? "Downloaded" : "Not downloaded"}
        </span>
        {enabled ? (
          model.downloaded ? (
            <button
              type="button"
              className="aid-btn"
              onClick={() => void act(model.key, "delete")}
              disabled={busy}
            >
              {isBusy ? "…" : "Delete"}
            </button>
          ) : (
            <button
              type="button"
              className="aid-btn aid-btn-primary"
              onClick={() => void act(model.key, "download")}
              disabled={busy}
            >
              {isBusy ? "Downloading…" : "Download"}
            </button>
          )
        ) : null}
      </div>
    );
  };

  return (
    <>
      {renderGroup("depth")}
      {renderGroup("interpolation")}

      {loading && (
        <p className="setting-description">Loading model list…</p>
      )}
      {error ? <p className="pxm-errors">{error}</p> : null}
    </>
  );
}
