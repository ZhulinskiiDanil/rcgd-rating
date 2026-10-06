import { load } from "cheerio";
import type { RecordEntry } from "../../shared/types/domain";
import { recordVideoUrl } from "../../shared/utils/record-video";
export { recordVideoUrl } from "../../shared/utils/record-video";

export interface VideoDateResult {
  date: string | null;
  source: "video" | null;
  sourceVideo: string;
  message?: string;
}
export interface RecordDateFields {
  achievedAt: string | null;
  dateSource: "manual" | "video" | null;
  sourceVideo: string;
}
type VideoRecord = Pick<
  RecordEntry,
  "manualPercent" | "importedPercent" | "manualVideo" | "importedVideo"
>;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const cache = new Map<string, { expires: number; result: VideoDateResult }>();

export function youtubeVideoUrl(input: string): string | null {
  if (!URL.canParse(input)) return null;
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    return null;
  let id: string | null = null;
  if (url.hostname === "youtu.be") {
    id = /^\/([a-zA-Z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
  } else if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "www.youtube-nocookie.com",
      "youtube-nocookie.com",
    ].includes(url.hostname)
  ) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else
      id =
        /^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})\/?$/.exec(
          url.pathname,
        )?.[1] ?? null;
  }
  return id && /^[a-zA-Z0-9_-]{11}$/.test(id)
    ? `https://www.youtube.com/watch?v=${id}`
    : null;
}

export function parseVideoPublicationDate(html: string): string | null {
  const $ = load(html);
  const raw =
    $('meta[itemprop="datePublished"]').attr("content") ||
    /"playerMicroformatRenderer"\s*:\s*\{[\s\S]{0,200000}?"publishDate"\s*:\s*"([^"]+)"/.exec(
      html,
    )?.[1];
  if (!raw || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(raw)) return null;
  const calendarDate = raw.slice(0, 10);
  const calendar = new Date(calendarDate);
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== calendarDate
  )
    return null;
  let day = calendarDate;
  if (raw.length > 10) {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
    const instant = new Date(raw);
    if (!Number.isFinite(instant.getTime())) return null;
    day = instant.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
  }
  if (
    day > new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" })
  )
    return null;
  return day;
}

async function boundedHtml(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new Error("Ответ YouTube слишком большой");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

export async function lookupVideoDate(input: string): Promise<VideoDateResult> {
  const sourceVideo = youtubeVideoUrl(input);
  if (!sourceVideo)
    return {
      date: null,
      source: null,
      sourceVideo: "",
      message: input
        ? "Автоматическая дата поддерживается для YouTube. Укажите дату вручную."
        : "Добавьте ссылку на видео прохождения или укажите дату вручную.",
    };
  const cached = cache.get(sourceVideo);
  if (cached && cached.expires > Date.now()) return cached.result;
  let result: VideoDateResult;
  try {
    const response = await fetch(sourceVideo, {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SPB-Demonlist/1.0)",
        "Accept-Language": "en-US,en;q=0.8",
        Accept: "text/html",
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`YouTube: HTTP ${response.status}`);
    }
    const date = parseVideoPublicationDate(await boundedHtml(response));
    result = date
      ? { date, source: "video", sourceVideo }
      : {
          date: null,
          source: null,
          sourceVideo,
          message: "YouTube не сообщил дату публикации. Укажите дату вручную.",
        };
  } catch {
    result = {
      date: null,
      source: null,
      sourceVideo,
      message:
        "Не удалось получить дату публикации с YouTube. Можно сохранить запись и указать дату вручную.",
    };
  }
  if (cache.size >= 512) cache.delete(cache.keys().next().value!);
  cache.set(sourceVideo, {
    expires: Date.now() + (result.date ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000),
    result,
  });
  return result;
}

export function automaticDateFields(
  record: VideoRecord & RecordDateFields,
  dates: Map<string, VideoDateResult>,
): RecordDateFields {
  if (record.dateSource === "manual")
    return {
      achievedAt: record.achievedAt,
      dateSource: "manual",
      sourceVideo: record.sourceVideo,
    };
  const sourceVideo = youtubeVideoUrl(recordVideoUrl(record)) || "";
  const date = dates.get(sourceVideo)?.date;
  if (date) return { achievedAt: date, dateSource: "video", sourceVideo };
  if (
    sourceVideo &&
    sourceVideo === record.sourceVideo &&
    record.dateSource === "video" &&
    record.achievedAt
  )
    return { achievedAt: record.achievedAt, dateSource: "video", sourceVideo };
  return { achievedAt: null, dateSource: null, sourceVideo };
}

export async function resolveAutomaticDate(
  record: VideoRecord & RecordDateFields,
): Promise<RecordDateFields> {
  const sourceVideo = youtubeVideoUrl(recordVideoUrl(record));
  if (
    record.dateSource === "manual" ||
    (sourceVideo &&
      record.dateSource === "video" &&
      sourceVideo === record.sourceVideo &&
      record.achievedAt)
  )
    return {
      achievedAt: record.achievedAt,
      dateSource: record.dateSource,
      sourceVideo: record.sourceVideo,
    };
  const result = await lookupVideoDate(recordVideoUrl(record));
  return automaticDateFields(record, new Map([[result.sourceVideo, result]]));
}
