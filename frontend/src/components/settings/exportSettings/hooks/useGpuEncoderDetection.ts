import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type {
  GpuEncoderCapabilities,
  NvidiaDetectionResult,
} from "../../../../features/export/profiles.ts"

const DEFAULT_DETECTION: NvidiaDetectionResult = {
  hasNvidiaGpu: false,
  gpuName: null,
  profile: "unsupported",
};

const DEFAULT_GPU_CAPABILITIES: GpuEncoderCapabilities = {
  hasGpuEncoder: false,
  preferredBackend: "none",
  availableBackends: [],
  availableVideoEncoders: [],
  h264Encoder: null,
  h265Encoder: null,
  av1Encoder: null,
  maxParallelExports: 1,
};

export default function useGpuEncoderDetection() {
  const [nvidiaDetection, setNvidiaDetection] =
    useState<NvidiaDetectionResult>(DEFAULT_DETECTION);

  const [gpuCapabilities, setGpuCapabilities] =
    useState<GpuEncoderCapabilities>(DEFAULT_GPU_CAPABILITIES);

  const [gpuProbeComplete, setGpuProbeComplete] = useState(false);

  useEffect(() => {
    let canceled = false;

    const detectHardware = async () => {
      const [nvidiaResult, gpuResult] = await Promise.allSettled([
        invoke<NvidiaDetectionResult>("detect_nvidia_encoder_profile"),
        invoke<GpuEncoderCapabilities>("detect_gpu_encoder_capabilities"),
      ]);

      if (canceled) return;

      if (nvidiaResult.status === "fulfilled") {
        setNvidiaDetection(nvidiaResult.value);
      } else {
        console.error("Failed to detect NVIDIA encoder profile:", nvidiaResult.reason);
      }

      if (gpuResult.status === "fulfilled") {
        setGpuCapabilities(gpuResult.value);
      } else {
        console.error("Failed to detect GPU encoder capabilities:", gpuResult.reason);
      }

      setGpuProbeComplete(true);
    };

    void detectHardware();

    return () => {
      canceled = true;
    };
  }, []);

  return {
    nvidiaDetection,
    gpuCapabilities,
    gpuProbeComplete,
  };
}