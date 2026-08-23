import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import SettingRow from "../common/SettingRow";
import { useAiDepsStore } from "../../stores/aiDepsStore";
import {
  formatBytes,
  isPackInstalled,
  type AiPackId,
} from "../../features/aiDeps/packs";
import { INTERPOLATION_MODEL_OPTIONS } from "../../features/export/postPasses";

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

const ALLOWED_INTERPOLATION_KEYS = new Set(
  INTERPOLATION_MODEL_OPTIONS.map((opt) => opt.value)
);

/**
 * AI model weight manager. Lists depth + interpolation models from the CLI and
 * lets the user download or delete them. Filtered to active export settings models.
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
    const rawList = models?.[category] ?? [];
    const list =
      category === "interpolation"
        ? rawList.filter((m) => ALLOWED_INTERPOLATION_KEYS.has(m.key))
        : rawList;

    return (
      <div key={category} style={{ marginBottom: 16 }}>
        <SettingRow
          label={CATEGORY_TITLE[category]}
          description={
            installed
              ? "Model weights used by this feature. Download them ahead of time for fast offline exporting."
              : `Install the ${CATEGORY_PACK[category]} feature in AI Packs to manage its models.`
          }
          control={
            installed ? (
              <span className="settings-value" style={{ width: "auto", fontSize: "0.85rem", opacity: 0.8 }}>
                {list.length} model{list.length === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="aid-state">Not available</span>
            )
          }
        />
        {installed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, paddingLeft: 12, borderLeft: "2px solid rgb(var(--accent-rgb) / 0.25)" }}>
            {list.map((model) => renderModel(model, true))}
          </div>
        )}
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
        style={{
          justifyContent: "space-between",
          opacity: enabled ? 1 : 0.5,
          padding: "8px 12px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 8,
          transition: "border-color 0.15s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: "0.92rem", color: "#ffffff", letterSpacing: "0.3px" }}>
            {model.name}
          </span>
          <span style={{ fontSize: "0.78rem", color: "rgba(255, 255, 255, 0.45)", fontFamily: "monospace" }}>
            {model.sizeBytes > 0 ? formatBytes(model.sizeBytes) : "—"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            className={`aid-state${model.downloaded ? " installed" : ""}`}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: "0.72rem",
              background: model.downloaded ? "rgb(var(--accent-rgb) / 0.12)" : "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${model.downloaded ? "rgb(var(--accent-rgb) / 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
            }}
          >
            {model.downloaded ? "Downloaded" : "Not downloaded"}
          </span>

          {enabled ? (
            model.downloaded ? (
              <button
                type="button"
                className="aid-btn"
                onClick={() => void act(model.key, "delete")}
                disabled={busy}
                style={{ height: 26, padding: "0 10px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center" }}
              >
                {isBusy ? "…" : "Delete"}
              </button>
            ) : (
              <button
                type="button"
                className="aid-btn aid-btn-primary"
                onClick={() => void act(model.key, "download")}
                disabled={busy}
                style={{ height: 26, padding: "0 10px", fontSize: "0.75rem", display: "inline-flex", alignItems: "center" }}
              >
                {isBusy ? "Downloading…" : "Download"}
              </button>
            )
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderGroup("depth")}
      {renderGroup("interpolation")}

      {loading && (
        <p className="setting-description" style={{ marginTop: 8 }}>Loading model list…</p>
      )}
      {error ? <p className="pxm-errors" style={{ marginTop: 8 }}>{error}</p> : null}
    </>
  );
}
