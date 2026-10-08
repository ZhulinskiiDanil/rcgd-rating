import { beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-test-")),
  "test.sqlite",
);
const { db, one, all } = await import("../server/database/index");
const {
  applyGlobal,
  mergeRecords,
  importSheet,
  synchronize,
  preserveImportedRecordsOnRebind,
} = await import("../server/services/sync");
const { mutate } = await import("../server/services/changes");
const { prepareRecordDates, refreshRecordDates, synchronizeVideoDates } =
  await import("../server/services/record-dates");
const {
  parseCoreboard,
  parseSheet,
  parseAchievements,
  fetchLevels,
  fetchRecords,
  fetchGameVersion,
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
  db().prepare("DELETE FROM settings WHERE key='mikaGlobalCutoff'").run();
  if (one("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'"))
    db().exec(
      "DELETE FROM sqlite_sequence WHERE name IN ('levels','records','districtExtras')",
    );
  applyGlobal(levels, null);
});
describe("Источники и сохранение данных", () => {
  it("сохраняет исправленную дату Legacy при синхронизации и обновляет её после нового вылета", () => {
    db().prepare("UPDATE levels SET verifiedLocal=1").run();
    mutate("Initial list", null, () => {});
    const level = one<{ id: number }>("SELECT id FROM levels WHERE gdlId=150")!;
    const outside = levels.map((entry) =>
      entry.id === 150 ? { ...entry, placement: 152 } : entry,
    );
    mutate("First exit", null, () => applyGlobal(outside, null));
    expect(
      one<any>("SELECT status FROM levels WHERE id=?", level.id)?.status,
    ).toBe("legacy");
    mutate("Correct exit date", null, () => {
      db()
        .prepare("UPDATE levels SET exitedAt=? WHERE id=?")
        .run("2026-09-28", level.id);
    });
    mutate("Next synchronization", null, () => applyGlobal(outside, null));
    expect(
      one<any>("SELECT exitedAt FROM levels WHERE id=?", level.id),
    ).toEqual({ exitedAt: "2026-09-28" });
    mutate("Clear exit date", null, () => {
      db().prepare("UPDATE levels SET exitedAt=NULL WHERE id=?").run(level.id);
    });
    mutate("Next synchronization", null, () => applyGlobal(outside, null));
    expect(
      one<any>("SELECT exitedAt FROM levels WHERE id=?", level.id),
    ).toEqual({ exitedAt: null });
    mutate("Returns", null, () => applyGlobal(levels, null));
    expect(
      one<any>("SELECT status,exitedAt FROM levels WHERE id=?", level.id),
    ).toEqual({ status: "extended", exitedAt: null });
    mutate("New exit", null, () => applyGlobal(outside, null));
    const freshExit = one<{ status: string; exitedAt: string }>(
      "SELECT status,exitedAt FROM levels WHERE id=?",
      level.id,
    )!;
    expect(freshExit.status).toBe("legacy");
    expect(Number.isFinite(Date.parse(freshExit.exitedAt))).toBe(true);
    expect(freshExit.exitedAt).not.toBe("2026-09-28");
  });

  it("не воссоздаёт каталог ниже Mika и сохраняет ранее известный уровень при будущем выпадении", () => {
    db().exec("DELETE FROM levels");
    const first = [
      { id: 500, name: "Future drop", placement: 90 },
      { id: 501, name: "Mika", placement: 100 },
      { id: 502, name: "Below Mika", placement: 101 },
    ];
    applyGlobal(first, null);
    expect(
      all<any>("SELECT gdlId FROM levels ORDER BY gdlId").map(
        (level) => level.gdlId,
      ),
    ).toEqual([500, 501]);
    const future = one<any>("SELECT * FROM levels WHERE gdlId=500");
    db().prepare("INSERT INTO players(id,name) VALUES(1,'Player')").run();
    db()
      .prepare(
        "INSERT INTO records(playerId,levelId,manualPercent,manualVideo,achievedAt,dateSource) VALUES(1,?,100,'manual-video','2026-09-01','manual')",
      )
      .run(future.id);
    mutate("Initial list", null, () => {});
    expect(
      one<any>("SELECT status FROM levels WHERE id=?", future.id)?.status,
    ).toBe("main");
    const record = one<any>("SELECT * FROM records WHERE levelId=?", future.id);
    mutate("Future drop", null, () =>
      applyGlobal(
        first.map((level) =>
          level.id === 500 ? { ...level, placement: 102 } : level,
        ),
        null,
      ),
    );
    expect(
      one<any>("SELECT * FROM levels WHERE id=?", future.id),
    ).toMatchObject({
      gdlId: 500,
      status: "legacy",
      globalRank: 102,
      exitedAt: expect.any(String),
    });
    expect(
      one<any>("SELECT * FROM records WHERE levelId=?", future.id),
    ).toEqual({ ...record, manualVideo: "" });
    expect(one("SELECT id FROM levels WHERE gdlId=502")).toBeUndefined();
  });

  it("использует сохранённую границу, если Mika временно отсутствует в снимке", () => {
    db().exec("DELETE FROM levels");
    db()
      .prepare(
        "INSERT INTO settings(key,value) VALUES('mikaGlobalCutoff','100')",
      )
      .run();
    applyGlobal(
      [
        { id: 900, name: "Allowed", placement: 99 },
        { id: 901, name: "Below Mika", placement: 101 },
      ],
      null,
    );
    expect(
      all<any>("SELECT gdlId FROM levels").map((level) => level.gdlId),
    ).toEqual([900]);
  });

  it("импорт таблицы не возвращает уровни ниже Mika как ручные, включая исправления названий", () => {
    db().exec("DELETE FROM levels");
    const incoming = [
      { id: 500, name: "Mika", placement: 100 },
      { id: 501, name: "Knights of Thunder", placement: 101 },
      { id: 502, name: "Below Mika", placement: 102 },
    ];
    applyGlobal(incoming, null);
    expect(
      importSheet(
        ["Mika", "Knight of Thunder", "Below Mika", "Custom level"],
        incoming,
      ),
    ).toEqual(["Custom level"]);
    expect(
      all<any>("SELECT name FROM levels ORDER BY id").map(
        (level) => level.name,
      ),
    ).toEqual(["Mika", "Custom level"]);
  });

  it("не тратит очередь версий на удалённый каталог ниже Mika", async () => {
    db().exec("DELETE FROM levels");
    for (const key of [
      "sheetImported",
      "playersSheetImported",
      "districtsSheetImported",
    ])
      db()
        .prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?, 'test')")
        .run(key);
    const incoming = levels.map((level) =>
      level.placement === 100 ? { ...level, name: "Mika" } : level,
    );
    const versionRequests: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname === "/level/classic/list")
          return Response.json({
            message: "success",
            data: {
              levels: Number(url.searchParams.get("offset")) ? [] : incoming,
            },
          });
        if (url.pathname === "/level/classic/get") {
          const id = Number(url.searchParams.get("id"));
          versionRequests.push(id);
          return Response.json({
            message: "success",
            data: { id, game_version: "2.2" },
          });
        }
        return new Response("Unavailable in test", { status: 503 });
      }),
    );
    await synchronize();
    expect(versionRequests).toHaveLength(100);
    expect(Math.max(...versionRequests)).toBe(100);
    expect(one<any>("SELECT count(*) AS count FROM levels")?.count).toBe(100);
    expect(
      one<any>("SELECT gameVersion FROM levels WHERE gdlId=100")?.gameVersion,
    ).toBe("2.2");
  });

  it("загружает версию из деталей глобала и сохраняет уже заполненное значение", async () => {
    const fetcher = vi.fn(
      async (_url: string) =>
        new Response(
          JSON.stringify({
            message: "success",
            data: { id: 1, game_version: 2.2 },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchGameVersion(1)).toBe("2.2");
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.demonlist.org/level/classic/get?id=1",
    );
    applyGlobal(
      [{ id: 1, name: "Level 1", placement: 1, game_version: 2.2 }],
      null,
    );
    expect(
      one<any>("SELECT gameVersion FROM levels WHERE gdlId=1").gameVersion,
    ).toBe("2.2");
    applyGlobal(levels, null);
    expect(
      one<any>("SELECT gameVersion FROM levels WHERE gdlId=1").gameVersion,
    ).toBe("2.2");
    db().prepare("UPDATE levels SET gameVersion='2.1' WHERE gdlId=1").run();
    applyGlobal(
      [{ id: 1, name: "Level 1", placement: 1, game_version: 2.2 }],
      null,
    );
    expect(
      one<any>("SELECT gameVersion FROM levels WHERE gdlId=1").gameVersion,
    ).toBe("2.1");
  });
  it("ручные t/T приоритетнее Coreboard, снятие ручного режима возвращает актуальные проценты", () => {
    db()
      .prepare(
        "UPDATE levels SET listPercent=30,endPercent=90,thresholdSource='manual' WHERE gdlId=1",
      )
      .run();
    const thresholds = [{ name: "Level 1", position: 1, t: 50, T: 95 }];
    applyGlobal(levels, thresholds);
    expect(
      one<any>(
        "SELECT listPercent,endPercent,thresholdSource FROM levels WHERE gdlId=1",
      ),
    ).toEqual({ listPercent: 30, endPercent: 90, thresholdSource: "manual" });
    db().prepare("UPDATE levels SET thresholdSource=NULL WHERE gdlId=1").run();
    applyGlobal(levels, thresholds);
    expect(
      one<any>("SELECT listPercent,endPercent FROM levels WHERE gdlId=1"),
    ).toEqual({ listPercent: 50, endPercent: 95 });
  });
  it("смена глобальной привязки сохраняет результаты, видео, даты и удаления", () => {
    db()
      .prepare("INSERT INTO players(id,name,gdlId) VALUES(1,'Player',50)")
      .run();
    db()
      .prepare(
        "INSERT INTO records(playerId,levelId,manualPercent,importedPercent,importedId,manualVideo,importedVideo,achievedAt,dateSource,sourceVideo,active,deletedAt) VALUES(1,1,90,100,123,'manual','imported','2025-03-01','video','imported',0,'2026-01-01')",
      )
      .run();
    preserveImportedRecordsOnRebind(1, 50);
    expect(one<any>("SELECT * FROM records WHERE playerId=1")).toMatchObject({
      playerId: 1,
      levelId: 1,
      manualPercent: 100,
      manualVideo: "imported",
      importedPercent: null,
      importedId: null,
      importedVideo: "",
      achievedAt: "2025-03-01",
      dateSource: "video",
      sourceVideo: "imported",
      active: 0,
      deletedAt: "2026-01-01",
      note: expect.stringContaining("игрок 50, рекорд 123"),
    });
    const first = one<any>("SELECT * FROM records WHERE playerId=1");
    preserveImportedRecordsOnRebind(1, 50);
    expect(one<any>("SELECT * FROM records WHERE playerId=1")).toEqual(first);
  });
  it("не восстанавливает удалённых игроков, уровни и рекорды", () => {
    db().prepare("INSERT INTO players(id,name) VALUES(1,'Player')").run();
    const record = {
      id: 44,
      percent: 100,
      status: "accepted",
      level: { id: 1, name: "Level 1", placement: 1 },
    };
    db().prepare("UPDATE players SET deletedAt='2026-01-01' WHERE id=1").run();
    mergeRecords(1, [record]);
    expect(all("SELECT * FROM records")).toHaveLength(0);
    db().prepare("UPDATE players SET deletedAt=NULL WHERE id=1").run();
    db()
      .prepare(
        "UPDATE levels SET deletedAt='2026-01-01',listExcluded=1 WHERE gdlId=1",
      )
      .run();
    applyGlobal(levels, null);
    mergeRecords(1, [record]);
    expect(all("SELECT * FROM records")).toHaveLength(0);
    db()
      .prepare("UPDATE levels SET deletedAt=NULL,listExcluded=0 WHERE gdlId=1")
      .run();
    mergeRecords(1, [record]);
    db().prepare("UPDATE records SET deletedAt='2026-01-01',active=0").run();
    mergeRecords(1, [record]);
    expect(one<any>("SELECT active,deletedAt FROM records")).toEqual({
      active: 0,
      deletedAt: "2026-01-01",
    });
  });
  it("синхронизация дат сохраняет ручную коррекцию во время запроса и не трогает удалённые записи", async () => {
    db().prepare("INSERT INTO players(id,name) VALUES(1,'Player')").run();
    db()
      .prepare(
        "INSERT INTO records(playerId,levelId,manualPercent,manualVideo) VALUES(1,1,100,'https://youtu.be/QWERTY12345')",
      )
      .run();
    db()
      .prepare(
        "INSERT INTO records(playerId,levelId,manualPercent,manualVideo,deletedAt) VALUES(1,2,100,'https://youtu.be/QWERTY54321','2026-01-01')",
      )
      .run();
    const fetcher = vi.fn(async () => {
      db()
        .prepare(
          "UPDATE records SET achievedAt='2025-02-01',dateSource='manual' WHERE levelId=1",
        )
        .run();
      return new Response(
        '<meta itemprop="datePublished" content="2025-03-17">',
      );
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await synchronizeVideoDates()).toMatchObject({
      updated: 0,
      checked: 1,
      unavailable: 0,
      deferred: 0,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      one<any>("SELECT achievedAt,dateSource FROM records WHERE levelId=1"),
    ).toEqual({ achievedAt: "2025-02-01", dateSource: "manual" });
    expect(
      one<any>("SELECT achievedAt FROM records WHERE levelId=2").achievedAt,
    ).toBeNull();
  });
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
  it("сохраняет прежний рекорд без флагов проверки, если глобал понизил процент", () => {
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
      missing: 0,
      reviewNeeded: 0,
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
      missing: 0,
      reviewNeeded: 0,
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
