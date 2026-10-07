import { all } from "../database";
export default defineEventHandler((event) => {
  const query = getQuery(event);
  if (
    query.kind &&
    !["level", "player-rating", "district-rating"].includes(String(query.kind))
  )
    return [];
  const page = Math.max(1, Math.min(100000, Number(query.page) || 1));
  const kind = ["level", "player-rating", "district-rating"].includes(
    String(query.kind),
  )
    ? String(query.kind)
    : "level";
  const search =
    typeof query.search === "string" ? query.search.trim().slice(0, 200) : "";
  return all<{
    id: number;
    kind: string;
    entityId: number | null;
    title: string;
    createdAt: string;
  }>(
    `SELECT id,kind,entityId,CASE WHEN kind IN ('player-rating','district-rating') THEN replace(replace(title,'«',''),'»','') ELSE title END AS title,createdAt FROM changes WHERE public=1 AND kind=? AND title LIKE ? ESCAPE '!' ORDER BY id DESC LIMIT 50 OFFSET ?`,
    kind,
    `%${search.replace(/[!%_]/g, "!$&")}%`,
    (page - 1) * 50,
  );
});
