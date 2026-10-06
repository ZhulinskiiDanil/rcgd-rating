import { all } from "../database";
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
    }>(
      "SELECT id,fromRank,toRank,fromTier,toTier,createdAt FROM levelHistory WHERE levelId=? ORDER BY id DESC LIMIT 100",
      Number(id),
    );
  return all<{
    id: number;
    score: number;
    rank: number | null;
    createdAt: string;
  }>(
    "SELECT id,score,rank,createdAt FROM (SELECT id,score,rank,createdAt,LAG(rank) OVER (ORDER BY id) AS previousRank,ROW_NUMBER() OVER (ORDER BY id) AS entry FROM ratingHistory WHERE entityType=? AND entityId=?) WHERE entry=1 OR rank IS NOT previousRank ORDER BY id DESC LIMIT 100",
    String(type),
    Number(id),
  );
});
