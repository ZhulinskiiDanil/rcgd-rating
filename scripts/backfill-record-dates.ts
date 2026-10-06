import { all, db } from "../server/database";
import type { RecordEntry } from "../shared/types/domain";
import { refreshRecordDates } from "../server/services/record-dates";
import {
  lookupVideoDate,
  recordVideoUrl,
  youtubeVideoUrl,
  type VideoDateResult,
} from "../server/services/video-date";

const connection = db();
try {
  const candidates = all<RecordEntry>(
    "SELECT * FROM records WHERE active=1 AND (dateSource IS NULL OR dateSource!='manual')",
  ).filter((record) => {
    const source = youtubeVideoUrl(recordVideoUrl(record));
    return (
      source &&
      !(
        record.dateSource === "video" &&
        record.achievedAt &&
        record.sourceVideo === source
      )
    );
  });
  const urls = [
    ...new Set(
      candidates.map((record) => youtubeVideoUrl(recordVideoUrl(record))!),
    ),
  ];
  const dates = new Map<string, VideoDateResult>();
  let next = 0;
  let completed = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, urls.length) }, async () => {
      while (next < urls.length) {
        const url = urls[next++]!;
        dates.set(url, await lookupVideoDate(url));
        completed += 1;
        if (completed % 20 === 0)
          console.log(`Обработано видео: ${completed}/${urls.length}`);
      }
    }),
  );
  const committed = connection.transaction(() => {
    const before = all<RecordEntry>("SELECT * FROM records");
    const previous = new Map(before.map((record) => [record.id, record]));
    refreshRecordDates(dates);
    const updated = all<RecordEntry>("SELECT * FROM records").filter(
      (record) => {
        const old = previous.get(record.id);
        return (
          old &&
          (old.achievedAt !== record.achievedAt ||
            old.dateSource !== record.dateSource ||
            old.sourceVideo !== record.sourceVideo)
        );
      },
    );
    return {
      updatedRecords: updated.length,
      manualDatesKept: before.filter((record) => record.dateSource === "manual")
        .length,
    };
  })();
  console.log({
    candidateRecords: candidates.length,
    videos: urls.length,
    datesFound: [...dates.values()].filter((result) => result.date).length,
    unavailable: [...dates.values()].filter((result) => !result.date).length,
    ...committed,
  });
} finally {
  connection.close();
}
