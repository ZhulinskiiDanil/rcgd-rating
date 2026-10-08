import { all } from "../database";
import { storedLevelNote, withoutHistoryQuotes } from "../services/list-events";
export default defineEventHandler((event) => {
  const { type, id } = getQuery(event);
  if (
    !["players", "districts", "levels"].includes(String(type)) ||
    !Number.isSafeInteger(Number(id))
  )
    throw createError({ statusCode: 400, message: "Некорректный запрос" });
  if (type === "levels")
    return all<{
      id: number;
      fromRank: number | null;
      toRank: number | null;
      fromTier: string | null;
      toTier: string | null;
      createdAt: string;
      note: string;
      noteEdited: number;
      updatedAt: string | null;
      primaryId: number | null;
      afterJson: string | null;
    }>(
      "SELECT h.id,h.fromRank,h.toRank,h.fromTier,h.toTier,h.note,h.noteEdited,h.createdAt,h.updatedAt,c.entityId AS primaryId,c.afterJson FROM levelHistory h LEFT JOIN changes c ON c.id=h.changeId AND c.kind='level' WHERE h.levelId=? AND h.deletedAt IS NULL ORDER BY h.createdAt DESC,h.id DESC LIMIT 100",
      Number(id),
    ).map(({ primaryId, afterJson, noteEdited, ...row }) => ({
      ...row,
      note: withoutHistoryQuotes(
        noteEdited
          ? row.note
          : !row.note || (row.toTier === "legacy" && row.note === "Подвинут")
            ? storedLevelNote(Number(id), primaryId, afterJson) || row.note
            : row.note,
      ),
    }));
  return all<{
    id: number;
    score: number;
    rank: number | null;
    fromRank: number | null;
    toRank: number | null;
    note: string;
    createdAt: string;
    updatedAt: string | null;
  }>(
    `SELECT id,score,rank,rank AS toRank,CASE WHEN changeId IS NOT NULL OR note<>'' THEN fromRank ELSE previousRank END AS fromRank,note,createdAt,updatedAt FROM (
      SELECT id,score,rank,fromRank,changeId,note,createdAt,updatedAt,LAG(rank) OVER (ORDER BY id) AS previousRank,ROW_NUMBER() OVER (ORDER BY id) AS entry
      FROM ratingHistory WHERE entityType=? AND entityId=? AND deletedAt IS NULL AND (
        rank IS NULL OR EXISTS (
          SELECT 1 FROM json_each(CASE WHEN json_valid(results) THEN results ELSE '[]' END)
          WHERE json_extract(value,'$.kind') IN ('completion','progress')
        )
      )
    ) WHERE entry=1 OR rank IS NOT previousRank OR changeId IS NOT NULL ORDER BY createdAt DESC,id DESC LIMIT 100`,
    String(type),
    Number(id),
  );
});
