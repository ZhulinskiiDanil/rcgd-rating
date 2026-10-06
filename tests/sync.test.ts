import { beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-test-")),
  "test.sqlite",
);
const { db, one, all } = await import("../server/database/index");
const { applyGlobal, mergeRecords, importSheet } =
  await import("../server/services/sync");
const { mutate } = await import("../server/services/changes");
const { prepareRecordDates, refreshRecordDates } =
  await import("../server/services/record-dates");
const {
  parseCoreboard,
  parseSheet,
  parseAchievements,
  fetchLevels,
  fetchRecords,
} = await import("../server/services/sources");
const levels = Array.from({ length: 151 }, (_, i) => ({
  id: i + 1,
  name: `Level ${i + 1}`,
  placement: i + 1,
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  db().exec(
    "DELETE FROM ratingHistory; DELETE FROM changes; DELETE FROM districtExtras; DELETE FROM records; DELETE FROM players; DELETE FROM levels;",
  );
  applyGlobal(levels, null);
});
describe("Источники и сохранение данных", () => {
  it("берёт дату первого из одинаковых лучших рекордов и не запрашивает даты ручных коррекций", async () => {
    db().prepare("INSERT INTO players(id,name) VALUES(1,'Player')").run();
    const fetcher = vi.fn(
      async () =>
        new Response('<meta itemprop="datePublished" content="2025-03-17">'),
    );
    vi.stubGlobal("fetch", fetcher);
    const firstVideo = "https://www.youtube.com/watch?v=DDDDDDDDDDD";
    const base = {
      id: 1,
      percent: 100,
      status: "accepted",
      video_url: firstVideo,
      level: { id: 1, name: "Level 1", placement: 1 },
    };
    const incoming = [
      base,
      { ...base, id: 2, video_url: "https://youtu.be/EEEEEEEEEEE" },
    ];
    const prepared = await prepareRecordDates(new Map([[1, incoming]]));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(prepared.dates.has(firstVideo)).toBe(true);
    mergeRecords(1, incoming);
    refreshRecordDates(prepared.dates);
    expect(one<any>("SELECT achievedAt,sourceVideo FROM records")).toEqual({
      achievedAt: "2025-03-17",
      sourceVideo: firstVideo,
    });
    db()
      .prepare("UPDATE records SET dateSource='manual',achievedAt='2025-03-14'")
      .run();
    fetcher.mockClear();
    await prepareRecordDates(
      new Map([[1, [{ ...base, video_url: "https://youtu.be/FFFFFFFFFFF" }]]]),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("синхронизация заполняет дату видео и сохраняет последующую ручную коррекцию", () => {
    db().prepare("INSERT INTO players(id,name) VALUES(1,'Player')").run();
    const video = "https://www.youtube.com/watch?v=AO--mVVFtKI";
    const record = {
      id: 1,
      percent: 100,
      status: "accepted",
      video_url: video,
      level: { id: 1, name: "Level 1", placement: 1 },
    };
    mergeRecords(1, [record]);
    const dates = new Map([
      [
        video,
        { date: "2025-03-17", source: "video" as const, sourceVideo: video },
      ],
    ]);
    refreshRecordDates(dates);
    expect(
      one<any>("SELECT achievedAt,dateSource,sourceVideo FROM records"),
    ).toEqual({
      achievedAt: "2025-03-17",
      dateSource: "video",
      sourceVideo: video,
    });
    db()
      .prepare("UPDATE records SET achievedAt='2025-03-14',dateSource='manual'")
      .run();
    mergeRecords(1, [record]);
    refreshRecordDates(dates);
    expect(one<any>("SELECT achievedAt,dateSource FROM records")).toEqual({
      achievedAt: "2025-03-14",
      dateSource: "manual",
    });
  });
  it("сохраняет ручные медиа и региональную верификацию при синхронизации", () => {
    db().prepare("INSERT INTO players(id,name) VALUES(1,'Verifier')").run();
    db()
      .prepare(
        "UPDATE levels SET previewImage=?,showcaseVideo=?,verificationPlayerId=1,verificationRegion='spb',verificationDate='2026-10-01' WHERE gdlId=1",
      )
      .run("https://example.com/cover.png", "https://example.com/showcase");
    applyGlobal(
      [
        {
          id: 1,
          name: "Renamed",
          placement: 2,
          verification_url: "https://example.com/new-global",
        },
      ],
      null,
    );
    expect(one<any>("SELECT * FROM levels WHERE gdlId=1")).toMatchObject({
      name: "Renamed",
      globalRank: 2,
      video: "https://example.com/new-global",
      previewImage: "https://example.com/cover.png",
      showcaseVideo: "https://example.com/showcase",
      verificationPlayerId: 1,
      verificationRegion: "spb",
      verificationDate: "2026-10-01",
      verifiedLocal: 0,
    });
  });
  it("сохраняет прежний рекорд для проверки, если глобал понизил процент", () => {
    db().prepare("INSERT INTO players(id,name) VALUES(1,?)").run("Player");
    const record = {
      id: 1,
      percent: 100,
      status: "accepted",
      level: { id: 1, name: "Level 1", placement: 1 },
    };
    mergeRecords(1, [record]);
    mergeRecords(1, [{ ...record, id: 2, percent: 90 }]);
    expect(one<any>("SELECT * FROM records")).toMatchObject({
      importedPercent: 100,
      missing: 1,
      reviewNeeded: 1,
    });
    const changes = all("SELECT * FROM changes").length;
    mergeRecords(1, [{ ...record, id: 2, percent: 90 }]);
    expect(all("SELECT * FROM changes")).toHaveLength(changes);
  });
  it("отличает пустые слоты, прохождения и прогрессы в таблице игроков", () => {
    const rows = parseAchievements(
      "Позиция,Ник игрока,Хардест 1,Хардест 2,Хардест 3,Хардест 4,Хардест 5,Хардест 6,Очки\n1,Player,Every End,Acheron 75%,X,,X,X,12",
    );
    expect(rows).toEqual([
      {
        name: "Player",
        results: [
          { name: "Every End", percent: 100 },
          { name: "Acheron", percent: 75 },
        ],
      },
    ]);
  });
  it("сопоставляет одноимённые версии по явным ID, не по позиции", () => {
    applyGlobal(
      [
        { id: 3226, name: "Thinking Space II", placement: 8 },
        { id: 3351, name: "Thinking Space II", placement: 42 },
      ],
      [
        { name: "Thinking Space II", position: 4, t: 65, T: 95 },
        { name: "Thinking Space II (Legacy)", position: 39, t: 68, T: 98 },
      ],
    );
    expect(
      one<any>("SELECT listPercent,endPercent FROM levels WHERE gdlId=3226"),
    ).toEqual({ listPercent: 65, endPercent: 95 });
    expect(
      one<any>("SELECT listPercent,endPercent FROM levels WHERE gdlId=3351"),
    ).toEqual({ listPercent: 68, endPercent: 98 });
  });
  it("парсит только первые 150 процентов", () => {
    const html = Array.from(
      { length: 200 },
      (_, i) => `<li id="level-${i + 1}">Level ${i + 1} (T=95, t=50)</li>`,
    ).join("");
    expect(parseCoreboard(html)).toHaveLength(150);
    expect(() => parseCoreboard("<html>Unavailable</html>")).toThrow();
  });
  it("не импортирует ошибочный CSV вместо списка", () => {
    expect(parseSheet("№,Название\n1,Every End\n2,Silent Clubstep")).toEqual([
      "Every End",
      "Silent Clubstep",
    ]);
    expect(() => parseSheet("<html>Error</html>")).toThrow();
  });
  it("сливает ручной результат и импорт, сохраняет решение при исчезновении", () => {
    db().prepare("INSERT INTO players(id,name) VALUES (1,?)").run("Player");
    db()
      .prepare(
        "INSERT INTO records(playerId,levelId,manualPercent,manualVideo) VALUES(1,1,100,?)",
      )
      .run("https://example.com/manual");
    const r = {
      id: 88,
      percent: 90,
      status: "accepted",
      video_url: "https://example.com/global",
      level: { id: 1, name: "Level 1", placement: 1 },
    };
    mergeRecords(1, [r]);
    mergeRecords(1, [r]);
    expect(all("SELECT * FROM records")).toHaveLength(1);
    mergeRecords(1, []);
    const row = one<any>("SELECT * FROM records");
    expect(row).toMatchObject({
      manualPercent: 100,
      importedPercent: 90,
      missing: 1,
      reviewNeeded: 1,
      active: 1,
    });
    mergeRecords(1, [r]);
    expect(one<any>("SELECT * FROM records")).toMatchObject({
      missing: 0,
      manualVideo: "https://example.com/manual",
    });
  });
  it("не включает отклонённые рекорды и не реактивирует ручное исключение", () => {
    db().prepare("INSERT INTO players(id,name) VALUES(1,?)").run("Player");
    const r = {
      id: 88,
      percent: 100,
      status: "rejected",
      level: { id: 1, name: "Level 1", placement: 1 },
    };
    mergeRecords(1, [r]);
    expect(all("SELECT * FROM records")).toHaveLength(0);
    mergeRecords(1, [{ ...r, status: "accepted" }]);
    db().prepare("UPDATE records SET active=0").run();
    mergeRecords(1, [{ ...r, status: "accepted" }]);
    expect(one<any>("SELECT active FROM records").active).toBe(0);
  });
  it("фиксирует вылет, дату, возврат и не создаёт changelog при повторном импорте", () => {
    mutate("Seed", null, () => {
      db().prepare("UPDATE levels SET verifiedLocal=1 WHERE id<=150").run();
    });
    expect(one<any>("SELECT status FROM levels WHERE id=150").status).toBe(
      "extended",
    );
    mutate("New", null, () => {
      db()
        .prepare("UPDATE levels SET globalRank=0,verifiedLocal=1 WHERE id=151")
        .run();
    });
    const legacy = one<any>("SELECT * FROM levels WHERE id=150");
    expect(legacy.status).toBe("legacy");
    expect(legacy.exitedAt).toBeTruthy();
    const count = all("SELECT * FROM changes").length;
    mutate("Same", null, () => {});
    expect(all("SELECT * FROM changes")).toHaveLength(count);
    mutate("Return", null, () =>
      db().prepare("UPDATE levels SET verifiedLocal=0 WHERE id=151").run(),
    );
    expect(one<any>("SELECT * FROM levels WHERE id=150")).toMatchObject({
      status: "extended",
      exitedAt: null,
    });
  });
  it("откатывает операцию и историю при ошибке", () => {
    expect(() =>
      mutate("Fail", null, () => {
        db().prepare("UPDATE levels SET verifiedLocal=1").run();
        throw new Error("fail");
      }),
    ).toThrow();
    expect(
      one<any>("SELECT SUM(verifiedLocal) AS count FROM levels").count,
    ).toBe(0);
    expect(all("SELECT * FROM changes")).toHaveLength(0);
  });
  it("отклоняет неполную выгрузку глобала до изменений", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: "success",
              data: { levels: levels.slice(0, 2) },
            }),
          ),
      ),
    );
    await expect(fetchLevels()).rejects.toThrow("Неполный");
  });
  it("читает все страницы рекордов и фильтрует rejected", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: i + 1,
      percent: 100,
      status: i === 50 ? "rejected" : "accepted",
      level: { id: i + 1, name: "Level", placement: i + 1 },
    }));
    const fetcher = vi.fn(async (input: string) => {
      const offset = Number(new URL(input).searchParams.get("offset"));
      return new Response(
        JSON.stringify({
          message: "success",
          data: { total_count: 51, records: rows.slice(offset, offset + 50) },
        }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchRecords(42)).toHaveLength(50);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
