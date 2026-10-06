import { load } from "cheerio";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { normalizedName } from "../../shared/utils/rating";

const apiLevel = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  placement: z.number().int().positive().nullable(),
  ingame_id: z.number().nullable().optional(),
  list_percent: z.number().nullable().optional(),
  length: z.number().nullable().optional(),
  holder: z.string().nullish(),
  verification_url: z.string().nullish(),
});
const apiRecord = z.object({
  id: z.number(),
  percent: z.number().min(0).max(100),
  status: z.string(),
  video_url: z.string().nullish(),
  level: z.object({
    id: z.number(),
    name: z.string(),
    placement: z.number().nullable(),
  }),
});
export type GlobalLevel = z.infer<typeof apiLevel>;
export type GlobalRecord = z.infer<typeof apiRecord>;
export interface Threshold {
  name: string;
  position: number;
  t: number;
  T: number;
}
export const API = "https://api.demonlist.org";
export const CORE = "https://coreboard.pythonanywhere.com/main/levels";
export const SHEET =
  "https://docs.google.com/spreadsheets/d/1vSOs24s1nX9hWiwoy8qWSWh28CUKODectnBz14Vpx5M/export?format=csv&gid=626858444";
export const sheetTab = (name: string) =>
  `https://docs.google.com/spreadsheets/d/1vSOs24s1nX9hWiwoy8qWSWh28CUKODectnBz14Vpx5M/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
export interface SheetEntry {
  name: string;
  results: { name: string; percent: number }[];
}
export function parseAchievements(csv: string): SheetEntry[] {
  const rows = parse(csv, { bom: true, skip_empty_lines: true }) as string[][];
  if (!rows[0]?.includes("Хардест 1"))
    throw new Error("Не распознаны колонки хардестов в таблице");
  return rows
    .slice(1)
    .filter((row) => /^\d+$/.test(row[0] ?? "") && row[1]?.trim())
    .map((row) => ({
      name: row[1]!.trim(),
      results: row
        .slice(2, 8)
        .map((cell) => cell.trim())
        .filter((cell) => cell && cell.toLowerCase() !== "x")
        .map((cell) => {
          const match = cell.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)%$/);
          return {
            name: match ? match[1]!.trim() : cell,
            percent: match ? Number(match[2]!.replace(",", ".")) : 100,
          };
        }),
    }));
}

export async function sourceText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      "User-Agent": "SPB-Demonlist-MVP/1.0",
      Accept: "application/json,text/html,text/csv",
    },
  });
  if (!response.ok)
    throw new Error(`Источник ${new URL(url).host}: HTTP ${response.status}`);
  return response.text();
}
export async function apiData(
  path: string,
  query: Record<string, string | number> = {},
) {
  const url = new URL(path, API);
  Object.entries(query).forEach(([key, value]) =>
    url.searchParams.set(key, String(value)),
  );
  const response = z
    .object({ message: z.literal("success"), data: z.unknown() })
    .parse(JSON.parse(await sourceText(url.href)));
  return response.data;
}
export async function fetchLevels(): Promise<GlobalLevel[]> {
  const levels: GlobalLevel[] = [];
  for (let offset = 0; offset < 20000; offset += 500) {
    const page = z
      .object({ levels: z.array(apiLevel) })
      .parse(
        await apiData("/level/classic/list", { limit: 500, offset }),
      ).levels;
    levels.push(...page);
    if (page.length < 500) break;
    if (offset === 19500)
      throw new Error("Слишком много страниц глобального списка");
  }
  if (
    new Set(levels.map((l) => l.id)).size !== levels.length ||
    levels.length < 150
  )
    throw new Error(
      "Неполный или повторяющийся глобальный список; обновление отменено",
    );
  const ranks = new Set(levels.map((l) => l.placement));
  if (Array.from({ length: 150 }, (_, i) => i + 1).some((n) => !ranks.has(n)))
    throw new Error("В глобальном топе-150 есть пропуски");
  return levels;
}
export async function fetchRecords(userId: number): Promise<GlobalRecord[]> {
  const results: GlobalRecord[] = [];
  let total = 0;
  for (let offset = 0; offset < 30000; offset += 50) {
    const page = z
      .object({ total_count: z.number(), records: z.array(apiRecord) })
      .parse(
        await apiData("/user/record/list", {
          user_id: userId,
          limit: 50,
          offset,
        }),
      );
    total = page.total_count;
    results.push(...page.records);
    if (results.length >= total) break;
    if (!page.records.length)
      throw new Error(`Не удалось прочитать все рекорды игрока ${userId}`);
  }
  if (
    new Set(results.map((r) => r.id)).size !== results.length ||
    results.length < total
  )
    throw new Error(`Неполная пагинация рекордов ${userId}`);
  return results.filter((r) => r.status === "accepted");
}
export function parseCoreboard(html: string): Threshold[] {
  const $ = load(html),
    rows: Threshold[] = [];
  $('li[id^="level-"]').each((_, el) => {
    const position = Number($(el).attr("id")?.replace("level-", ""));
    if (position < 1 || position > 150) return;
    const match = $(el)
      .text()
      .trim()
      .match(
        /^(.*?)\s*\(T\s*=\s*(\d+(?:\.\d+)?),\s*t\s*=\s*(\d+(?:\.\d+)?)\)$/,
      );
    if (!match)
      throw new Error(`Не распознаны проценты Coreboard #${position}`);
    const T = Number(match[2]),
      t = Number(match[3]);
    if (!(t > 0 && T > t && T <= 100))
      throw new Error(`Некорректные проценты Coreboard #${position}`);
    rows.push({ name: match[1]!.trim(), position, t, T });
  });
  if (rows.length !== 150 || new Set(rows.map((r) => r.position)).size !== 150)
    throw new Error(
      "Coreboard не вернул полный топ-150; старые проценты сохранены",
    );
  return rows;
}
export function parseSheet(csv: string): string[] {
  const rows = parse(csv, { bom: true, skip_empty_lines: true }) as string[][];
  const names = rows
    .slice(1)
    .filter((r) => /^\d+$/.test(r[0] ?? "") && r[1]?.trim())
    .map((r) => r[1]!.trim());
  if (!names.length || new Set(names.map(normalizedName)).size !== names.length)
    throw new Error("Таблица не содержит уникального списка уровней");
  return names;
}
