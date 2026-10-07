import { all } from "../database";
import { withoutHistoryQuotes } from "../services/list-events";
import { formatDistrictHistory } from "../services/district-history";
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
  const districtNames =
    kind === "district-rating"
      ? all<{ name: string }>("SELECT name FROM districts").map(
          (row) => row.name,
        )
      : [];
  return all<{
    id: number;
    kind: string;
    entityId: number | null;
    title: string;
    createdAt: string;
    updatedAt: string | null;
  }>(
    `SELECT id,kind,entityId,title,createdAt,updatedAt FROM changes WHERE public=1 AND deletedAt IS NULL AND kind=? AND title LIKE ? ESCAPE '!' ORDER BY createdAt DESC,id DESC LIMIT 50 OFFSET ?`,
    kind,
    `%${search.replace(/[!%_]/g, "!$&")}%`,
    (page - 1) * 50,
  ).map((row) => ({
    ...row,
    title: withoutHistoryQuotes(
      row.kind === "district-rating"
        ? formatDistrictHistory(row.title, districtNames)
        : row.title,
    ),
  }));
});
