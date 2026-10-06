import { dataset, all, one } from "../database";
import { rankings } from "../services/rankings";
export default defineEventHandler(() => {
  const data = dataset();
  return {
    ...data,
    records: data.records
      .filter((r) => !r.deletedAt)
      .map(({ note, ...r }) => ({
        ...r,
        fromSheet: note.startsWith("Источник: исходная таблица СПб;"),
      })),
    ...rankings(data),
    sync:
      one<{ status: string; finishedAt: string | null; error: string | null }>(
        "SELECT status,finishedAt,error FROM syncRuns ORDER BY id DESC LIMIT 1",
      ) ?? null,
    sources: all<{ key: string; value: string }>(
      "SELECT key,value FROM settings WHERE key IN ('coreUpdatedAt','globalUpdatedAt')",
    ),
  };
});
