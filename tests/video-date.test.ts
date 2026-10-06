import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { migrateRecordDates } from "../server/database/migrations";
import {
  automaticDateFields,
  lookupVideoDate,
  parseVideoPublicationDate,
  recordVideoUrl,
  youtubeVideoUrl,
} from "../server/services/video-date";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const canonical = "https://www.youtube.com/watch?v=AO--mVVFtKI";
const baseRecord = {
  manualPercent: 100,
  manualVideo: canonical,
  importedPercent: null,
  importedVideo: "",
  achievedAt: null,
  dateSource: null,
  sourceVideo: "",
};

describe("Даты публикации видео", () => {
  it("принимает известные YouTube форматы и убирает произвольные параметры", () => {
    for (const url of [
      "https://youtu.be/AO--mVVFtKI?si=tracker",
      "https://m.youtube.com/watch?v=AO--mVVFtKI&t=50",
      "https://www.youtube.com/shorts/AO--mVVFtKI",
      "https://www.youtube.com/live/AO--mVVFtKI",
      "https://www.youtube-nocookie.com/embed/AO--mVVFtKI",
    ])
      expect(youtubeVideoUrl(url)).toBe(canonical);
    for (const url of [
      "https://youtube.com.evil.test/watch?v=AO--mVVFtKI",
      "https://youtube.com@127.0.0.1/watch?v=AO--mVVFtKI",
      "http://127.0.0.1/",
      "https://www.youtube.com:8443/watch?v=AO--mVVFtKI",
      "https://www.youtube.com/redirect?q=http://127.0.0.1",
      "file:///etc/passwd",
      "https://youtu.be/not-an-id",
      "javascript:alert(1)",
    ])
      expect(youtubeVideoUrl(url)).toBeNull();
  });
  it("использует публикацию, а не загрузку; переводит timestamp в МСК", () => {
    expect(
      parseVideoPublicationDate(
        '<meta itemprop="datePublished" content="2025-03-16T18:36:39-07:00"><script>{"uploadDate":"2025-03-15"}</script>',
      ),
    ).toBe("2025-03-17");
    expect(
      parseVideoPublicationDate(
        '<meta content="2025-03-16" itemprop="datePublished">',
      ),
    ).toBe("2025-03-16");
    expect(
      parseVideoPublicationDate(
        '<script>{"playerMicroformatRenderer":{"uploadDate":"2025-03-15","publishDate":"2025-03-16T22:30:00Z"}}</script>',
      ),
    ).toBe("2025-03-17");
    expect(
      parseVideoPublicationDate(
        '<meta itemprop="uploadDate" content="2025-03-15">',
      ),
    ).toBeNull();
  });
  it("не выдумывает дату из текста, некорректной даты и будущей премьеры", () => {
    for (const html of [
      "<div>Published yesterday</div>",
      '<meta itemprop="datePublished" content="2025-02-30">',
      '<meta itemprop="datePublished" content="2999-01-01">',
      '<meta itemprop="datePublished" content="2025-03-16T12:00:00">',
    ])
      expect(parseVideoPublicationDate(html)).toBeNull();
  });
  it("запрашивает только canonical YouTube URL, запрещает редиректы и кэширует успешную дату", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          '<meta itemprop="datePublished" content="2025-03-16T18:36:39-07:00">',
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await lookupVideoDate("https://youtu.be/AO--mVVFtKI?si=test"),
    ).toMatchObject({
      date: "2025-03-17",
      source: "video",
      sourceVideo: canonical,
    });
    await lookupVideoDate(canonical);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      canonical,
      expect.objectContaining({
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it("не обращается к сторонним и внутренним адресам", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await lookupVideoDate("http://127.0.0.1/admin")).toMatchObject({
      date: null,
      source: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("при блокировке YouTube и превышении ответа оставляет ручной ввод", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unavailable", { status: 429 })),
    );
    expect(await lookupVideoDate("https://youtu.be/AAAAAAAAAAA")).toMatchObject(
      { date: null, source: null, message: expect.stringContaining("вручную") },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(2 * 1024 * 1024 + 1))),
    );
    expect(await lookupVideoDate("https://youtu.be/BBBBBBBBBBB")).toMatchObject(
      { date: null, source: null },
    );
  });
  it("привязывает дату к видео наибольшего процента и не берёт 90% за дату 100%", () => {
    expect(
      recordVideoUrl({
        ...baseRecord,
        manualPercent: 90,
        importedPercent: 100,
        importedVideo: "imported",
      }),
    ).toBe("imported");
    expect(
      recordVideoUrl({
        ...baseRecord,
        manualVideo: "",
        importedPercent: 90,
        importedVideo: "wrong",
      }),
    ).toBe("");
    expect(
      recordVideoUrl({
        ...baseRecord,
        manualVideo: "",
        importedPercent: 100,
        importedVideo: "equal",
      }),
    ).toBe("equal");
  });
  it("ручная коррекция важнее автоматической даты, включая намеренно пустую дату", () => {
    const dates = new Map([
      [
        canonical,
        {
          date: "2025-03-17",
          source: "video" as const,
          sourceVideo: canonical,
        },
      ],
    ]);
    expect(
      automaticDateFields(
        { ...baseRecord, achievedAt: "2025-03-14", dateSource: "manual" },
        dates,
      ),
    ).toMatchObject({ achievedAt: "2025-03-14", dateSource: "manual" });
    expect(
      automaticDateFields({ ...baseRecord, dateSource: "manual" }, dates),
    ).toMatchObject({ achievedAt: null, dateSource: "manual" });
  });
  it("сохраняет известную дату при сбое источника, но убирает старую при замене видео", () => {
    const record = {
      ...baseRecord,
      achievedAt: "2025-03-17",
      dateSource: "video" as const,
      sourceVideo: canonical,
    };
    expect(automaticDateFields(record, new Map())).toMatchObject({
      achievedAt: "2025-03-17",
      dateSource: "video",
    });
    expect(
      automaticDateFields(
        { ...record, manualVideo: "https://youtu.be/CCCCCCCCCCC" },
        new Map(),
      ),
    ).toMatchObject({ achievedAt: null, dateSource: null });
  });
  it("миграция защищает старые даты как ручные и сохраняет provenance при повторении", () => {
    const db = new Database(":memory:");
    try {
      db.exec(
        "CREATE TABLE records(id INTEGER PRIMARY KEY,achievedAt TEXT); INSERT INTO records VALUES(1,'2025-03-14'),(2,NULL); PRAGMA user_version=2;",
      );
      migrateRecordDates(db);
      expect(db.prepare("SELECT * FROM records WHERE id=1").get()).toEqual({
        id: 1,
        achievedAt: "2025-03-14",
        dateSource: "manual",
        sourceVideo: "",
      });
      expect(
        db.prepare("SELECT dateSource FROM records WHERE id=2").get(),
      ).toEqual({ dateSource: null });
      db.prepare(
        "UPDATE records SET dateSource='video',sourceVideo=?,achievedAt='2025-03-17' WHERE id=2",
      ).run(canonical);
      migrateRecordDates(db);
      expect(
        db
          .prepare("SELECT dateSource,sourceVideo FROM records WHERE id=2")
          .get(),
      ).toEqual({ dateSource: "video", sourceVideo: canonical });
      expect(db.pragma("user_version", { simple: true })).toBe(3);
    } finally {
      db.close();
    }
  });
});
