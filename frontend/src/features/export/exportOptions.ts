import {
  getRecommendedContainerForCodec,
  isExportCodecContainerCompatible,
  type ExportProfile,
} from "./profiles";

export type ExportOptionsPayload = {
  profileId: string;
  workflow: string;
  editorTarget: string;
  codec: string;
  audioMode: string;
  hardwareMode: string;
  parallelExports: number;
};

// strips path separators, control chars and reserved characters so a user-typed
// merge name cannot escape the export folder
export function sanitizeExportBaseName(rawBase: string): string {
  return (
    rawBase
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
      .replace(/^\.+/, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "merged"
  );
}

export function findActiveProfile(
  profiles: ExportProfile[],
  profileId: string
): ExportProfile | undefined {
  return profiles.find((candidate) => candidate.id === profileId) ?? profiles[0];
}

// the profile's container, unless an encode would produce a codec that container
// cannot hold
export function resolveExportFormat(profile: ExportProfile | undefined): string {
  const preferred = profile?.container || "mp4";
  if (!profile || profile.workflow !== "video_encode") return preferred;
  return isExportCodecContainerCompatible(profile.codec, preferred)
    ? preferred
    : getRecommendedContainerForCodec(profile.codec);
}

export function buildExportOptionsPayload(
  profiles: ExportProfile[],
  profileId: string
): ExportOptionsPayload | undefined {
  const profile = findActiveProfile(profiles, profileId);
  if (!profile) return undefined;

  return {
    profileId: profile.id,
    workflow: profile.workflow,
    editorTarget: profile.editorTarget,
    codec: profile.codec,
    // mov has no flac, so fall back to its lossless equivalent
    audioMode:
      profile.container === "mov" && profile.audioMode === "flac" ? "alac" : profile.audioMode,
    hardwareMode: profile.hardwareMode,
    parallelExports: profile.parallelExports,
  };
}

export function pathSeparatorFor(dir: string): string {
  return dir.includes("\\") ? "\\" : "/";
}

export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  return err instanceof Error ? err.message : "Unknown error";
}
