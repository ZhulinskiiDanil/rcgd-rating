import { all } from "../database";
export default defineEventHandler(() =>
  all<{ id: number; title: string; createdAt: string }>(
    "SELECT id,title,createdAt FROM changes WHERE kind='news' ORDER BY id DESC LIMIT 100",
  ),
);
