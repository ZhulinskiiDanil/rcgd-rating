import type { RecordEntry } from "../types/domain";

export function recordVideoUrl(
  record: Pick<
    RecordEntry,
    "manualPercent" | "importedPercent" | "manualVideo" | "importedVideo"
  >,
): string {
  if ((record.importedPercent ?? 0) > (record.manualPercent ?? 0))
    return record.importedVideo;
  if (record.manualPercent !== null)
    return (
      record.manualVideo ||
      (record.manualPercent === record.importedPercent
        ? record.importedVideo
        : "")
    );
  return record.importedVideo;
}
