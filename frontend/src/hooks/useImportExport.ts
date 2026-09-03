import { useRef } from "react";
import { useAppStateStore } from "../stores/appStore";
import { useImportPipeline } from "./useImportPipeline";
import { useExport } from "./useExport";

type ImportExportProps = {
  abortedRef?: React.RefObject<boolean>;
  onRPCUpdate?: (data: any) => void;
};

export default function useImportExport(props?: ImportExportProps) {
  // selectors, not the whole store: PreviewContainer and ImportButtons both use
  // this hook, and subscribing to everything re-rendered both on every progress
  // tick during an import
  const loading = useAppStateStore((s) => s.loading);
  const importToken = useAppStateStore((s) => s.importToken);
  const batchTotal = useAppStateStore((s) => s.batchTotal);
  const batchDone = useAppStateStore((s) => s.batchDone);
  const batchCurrentFile = useAppStateStore((s) => s.batchCurrentFile);
  const setImportToken = useAppStateStore((s) => s.setImportToken);

  const localAbortedRef = useRef(false);
  const importing = useImportPipeline({ abortedRef: props?.abortedRef ?? localAbortedRef });
  const exporting = useExport({ onRPCUpdate: props?.onRPCUpdate });

  return {
    loading,
    importToken,
    setImportToken,
    batchTotal,
    batchDone,
    batchCurrentFile,
    ...importing,
    ...exporting,
  };
}
