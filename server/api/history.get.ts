import { all } from "../database";
export default defineEventHandler((event) => {
  const { type, id } = getQuery(event);
  if (
    !["players", "districts"].includes(String(type)) ||
    !Number.isSafeInteger(Number(id))
  )
    throw createError({ statusCode: 400, message: "Некорректный запрос" });
  return all<{
    id: number;
    score: number;
    rank: number;
    reason: string;
    createdAt: string;
  }>(
    "SELECT id,score,rank,reason,createdAt FROM ratingHistory WHERE entityType=? AND entityId=? ORDER BY id DESC LIMIT 100",
    String(type),
    Number(id),
  );
});
