import { all, db, one } from "../database";
import type { Level, RecordEntry } from "../../shared/types/domain";
import type { GlobalRecord } from "./sources";
import {
  automaticDateFields,
  lookupVideoDate,
  recordVideoUrl,
  youtubeVideoUrl,
  type VideoDateResult,
} from "./video-date";
import { logChange, mutate } from "./changes";
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
  | "deletedAt"
>;
let nextBatch = 0;

export async function prepareRecordDates(
  incoming: Map<number, GlobalRecord[]>,
  refresh = false,
) {
  const records = all<RecordEntry>(
    "SELECT r.* FROM records r JOIN players p ON p.id=r.playerId JOIN levels l ON l.id=r.levelId WHERE p.deletedAt IS NULL AND l.deletedAt IS NULL AND l.listExcluded=0",
  );
  const playerIds = new Set(
    all<{ id: number }>("SELECT id FROM players WHERE deletedAt IS NULL").map(
      (player) => player.id,
    ),
  );
  const globalIds = new Map(
    all<Level>(
      "SELECT * FROM levels WHERE deletedAt IS NULL AND listExcluded=0",
    ).map((level) => [level.id, level.gdlId]),
  );
  const knownGlobalIds = new Set(globalIds.values());
  const blocked = new Set(
    all<{ playerId: number; gdlId: number }>(
      "SELECT d.playerId,l.gdlId FROM deletedRecordImports d JOIN levels l ON l.id=d.levelId WHERE l.gdlId IS NOT NULL",
    ).map((row) => `${row.playerId}:${row.gdlId}`),
  );
  const candidates = new Map<string, DateCandidate>(
    records.map((record) => [
      `${record.playerId}:${globalIds.get(record.levelId) ?? `local-${record.levelId}`}`,
      record,
    ]),
  );
  for (const [playerId, rows] of incoming) {
    if (!playerIds.has(playerId)) continue;
    const best = new Map<number, GlobalRecord>();
    for (const row of rows)
      if (
        row.status === "accepted" &&
        (!best.has(row.level.id) ||
          best.get(row.level.id)!.percent < row.percent)
      )
        best.set(row.level.id, row);
    for (const row of best.values()) {
      if (!knownGlobalIds.has(row.level.id)) continue;
      const key = `${playerId}:${row.level.id}`;
      if (blocked.has(key)) continue;
      const previous = candidates.get(key);
      if (
        previous?.deletedAt ||
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
        deletedAt: previous?.deletedAt ?? null,
      });
    }
  }
  const urls = [
    ...new Set(
      [...candidates.values()].flatMap((record) => {
        const url = youtubeVideoUrl(recordVideoUrl(record));
        return !record.deletedAt &&
          record.active !== 0 &&
          record.dateSource !== "manual" &&
          url &&
          (refresh ||
            !(
              record.dateSource === "video" &&
              record.achievedAt &&
              record.sourceVideo === url
            ))
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
        dates.set(url, await lookupVideoDate(url, refresh));
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
  let updated = 0;
  const update = db().prepare(
    "UPDATE records SET achievedAt=?,dateSource=?,sourceVideo=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
  );
  for (const record of all<RecordEntry>(
    "SELECT r.* FROM records r JOIN players p ON p.id=r.playerId JOIN levels l ON l.id=r.levelId WHERE r.active=1 AND r.deletedAt IS NULL AND p.deletedAt IS NULL AND l.deletedAt IS NULL AND l.listExcluded=0 AND (r.dateSource IS NULL OR r.dateSource!='manual')",
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
    updated++;
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
  return updated;
}

export async function synchronizeVideoDates(actorId: number | null = null) {
  const now = Date.now();
  const acquired = db().transaction(() => {
    const lock = one<{ value: string }>(
      "SELECT value FROM settings WHERE key='videoDateSyncLock'",
    );
    if (lock && Number(lock.value) > now) return false;
    db()
      .prepare(
        "INSERT OR REPLACE INTO settings(key,value) VALUES ('videoDateSyncLock',?)",
      )
      .run(String(now + 10 * 60 * 1000));
    return true;
  })();
  if (!acquired) throw new Error("Синхронизация дат уже выполняется");
  try {
    const prepared = await prepareRecordDates(new Map(), true);
    return mutate("Синхронизация дат видео", actorId, () => {
      const updated = refreshRecordDates(prepared.dates, actorId);
      db()
        .prepare(
          "INSERT OR REPLACE INTO settings(key,value) VALUES ('videoDatesUpdatedAt',?)",
        )
        .run(new Date().toISOString());
      return {
        updated,
        checked: prepared.dates.size,
        unavailable: prepared.unavailable,
        deferred: prepared.deferred,
      };
    });
  } finally {
    db().prepare("DELETE FROM settings WHERE key='videoDateSyncLock'").run();
  }
}
