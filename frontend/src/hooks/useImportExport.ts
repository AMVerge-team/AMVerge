import { useAppStateStore } from "../stores/appStore";
import { importAbortRef } from "../features/import/importPipeline";
import { useImportPipeline } from "./useImportPipeline";
import { useExport } from "./useExport";

type ImportExportProps = {
  onRPCUpdate?: (data: any) => void;
};

export default function useImportExport(props?: ImportExportProps) {
  // selectors, not the whole store, so progress ticks don't re-render every user of this hook
  const loading = useAppStateStore((s) => s.loading);
  const importToken = useAppStateStore((s) => s.importToken);
  const batchTotal = useAppStateStore((s) => s.batchTotal);
  const batchDone = useAppStateStore((s) => s.batchDone);
  const batchCurrentFile = useAppStateStore((s) => s.batchCurrentFile);
  const setImportToken = useAppStateStore((s) => s.setImportToken);

  // shared, so the ✕ stops an import started from any button, not only App's own
  const importing = useImportPipeline({ abortedRef: importAbortRef });
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
