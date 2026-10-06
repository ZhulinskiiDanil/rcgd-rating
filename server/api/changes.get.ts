import { all } from "../database";
export default defineEventHandler((event) => {
  const query = getQuery(event);
  const page = Math.max(1, Math.min(100000, Number(query.page) || 1));
  const kind = typeof query.kind === "string" ? query.kind : "";
  return all<{
    id: number;
    kind: string;
    entityId: number | null;
    title: string;
    createdAt: string;
  }>(
    `SELECT id,kind,entityId,title,createdAt FROM changes WHERE public=1 AND kind IN ('level','player-rating','district-rating') ${kind ? "AND kind=?" : ""} ORDER BY id DESC LIMIT 50 OFFSET ?`,
    ...(kind ? [kind] : []),
    (page - 1) * 50,
  );
});
