import { all, db } from "../database";
import type { Level, RecordEntry } from "../../shared/types/domain";
import type { GlobalRecord } from "./sources";
import {
  automaticDateFields,
  lookupVideoDate,
  recordVideoUrl,
  youtubeVideoUrl,
  type VideoDateResult,
} from "./video-date";
import { logChange } from "./changes";
type DateCandidate = Pick<
  RecordEntry,
  | "manualPercent"
  | "manualVideo"
  | "importedPercent"
  | "importedVideo"
  | "active"
  | "achievedAt"
  | "dateSource"
  | "sourceVideo"
>;
let nextBatch = 0;

export async function prepareRecordDates(
  incoming: Map<number, GlobalRecord[]>,
) {
  const records = all<RecordEntry>("SELECT * FROM records");
  const globalIds = new Map(
    all<Level>("SELECT * FROM levels").map((level) => [level.id, level.gdlId]),
  );
  const candidates = new Map<string, DateCandidate>(
    records.map((record) => [
      `${record.playerId}:${globalIds.get(record.levelId) ?? `local-${record.levelId}`}`,
      record,
    ]),
  );
  for (const [playerId, rows] of incoming) {
    const best = new Map<number, GlobalRecord>();
    for (const row of rows)
      if (
        row.status === "accepted" &&
        (!best.has(row.level.id) ||
          best.get(row.level.id)!.percent < row.percent)
      )
        best.set(row.level.id, row);
    for (const row of best.values()) {
      const key = `${playerId}:${row.level.id}`;
      const previous = candidates.get(key);
      if (
        previous?.dateSource === "manual" ||
        (previous?.importedPercent ?? 0) > row.percent
      )
        continue;
      candidates.set(key, {
        manualPercent: previous?.manualPercent ?? null,
        manualVideo: previous?.manualVideo ?? "",
        importedPercent: row.percent,
        importedVideo: row.video_url ?? "",
        active: previous?.active ?? 1,
        achievedAt: previous?.achievedAt ?? null,
        dateSource: previous?.dateSource ?? null,
        sourceVideo: previous?.sourceVideo ?? "",
      });
    }
  }
  const urls = [
    ...new Set(
      [...candidates.values()].flatMap((record) => {
        const url = youtubeVideoUrl(recordVideoUrl(record));
        return record.active !== 0 &&
          record.dateSource !== "manual" &&
          url &&
          !(
            record.dateSource === "video" &&
            record.achievedAt &&
            record.sourceVideo === url
          )
          ? [url]
          : [];
      }),
    ),
  ];
  const offset = urls.length ? nextBatch % urls.length : 0;
  const pending = [...urls.slice(offset), ...urls.slice(0, offset)].slice(
    0,
    60,
  );
  nextBatch = offset + pending.length;
  const dates = new Map<string, VideoDateResult>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (next < pending.length) {
        const url = pending[next++]!;
        dates.set(url, await lookupVideoDate(url));
      }
    }),
  );
  return {
    dates,
    deferred: Math.max(0, urls.length - pending.length),
    unavailable: [...dates.values()].filter((result) => !result.date).length,
  };
}

export function refreshRecordDates(
  dates: Map<string, VideoDateResult>,
  actorId: number | null = null,
) {
  const update = db().prepare(
    "UPDATE records SET achievedAt=?,dateSource=?,sourceVideo=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
  );
  for (const record of all<RecordEntry>(
    "SELECT * FROM records WHERE active=1 AND (dateSource IS NULL OR dateSource!='manual')",
  )) {
    const fields = automaticDateFields(record, dates);
    if (
      fields.achievedAt === record.achievedAt &&
      fields.dateSource === record.dateSource &&
      fields.sourceVideo === record.sourceVideo
    )
      continue;
    update.run(
      fields.achievedAt,
      fields.dateSource,
      fields.sourceVideo,
      record.id,
    );
    if (fields.achievedAt !== record.achievedAt)
      logChange(
        "record-date",
        record.playerId,
        "Обновлена дата прохождения по публикации видео",
        { achievedAt: record.achievedAt },
        { playerId: record.playerId, levelId: record.levelId, ...fields },
        actorId,
      );
  }
}
