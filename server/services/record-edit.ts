import type { RecordEntry } from "../../shared/types/domain";
import { recordVideoUrl } from "../../shared/utils/record-video";

type RecordEdit = Pick<
  RecordEntry,
  "playerId" | "levelId" | "manualPercent" | "manualVideo"
> & {
  discardImported: boolean;
};

export function recordEditFields(edit: RecordEdit, before: RecordEntry | null) {
  const fields = {
    manualPercent: edit.manualPercent,
    manualVideo: edit.manualVideo,
    importedPercent: edit.discardImported
      ? null
      : (before?.importedPercent ?? null),
    importedId: edit.discardImported ? null : (before?.importedId ?? null),
    importedVideo: edit.discardImported ? "" : (before?.importedVideo ?? ""),
    missing: edit.discardImported ? 0 : (before?.missing ?? 0),
  };
  if (
    before &&
    (before.playerId !== edit.playerId || before.levelId !== edit.levelId)
  ) {
    const video = recordVideoUrl(fields);
    fields.manualPercent =
      Math.max(fields.manualPercent ?? 0, fields.importedPercent ?? 0) || null;
    fields.manualVideo = video;
    fields.importedPercent = null;
    fields.importedId = null;
    fields.importedVideo = "";
    fields.missing = 0;
  }
  return fields;
}

export function recordEditIsCurrent(
  before: RecordEntry,
  current: RecordEntry | undefined,
): boolean {
  return (
    !!current &&
    !current.deletedAt &&
    (Object.keys(before) as (keyof RecordEntry)[]).every(
      (key) => before[key] === current[key],
    )
  );
}

export function movedRecordTombstone(
  before: RecordEntry,
  playerId: number,
  levelId: number,
  now: string,
): Omit<RecordEntry, "id"> | null {
  if (
    (before.playerId === playerId && before.levelId === levelId) ||
    (before.importedPercent === null && before.importedId === null)
  )
    return null;
  const { id: _id, ...record } = before;
  return { ...record, active: 0, deletedAt: now, updatedAt: now };
}
