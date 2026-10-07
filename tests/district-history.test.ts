import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  districtGenitive,
  formatDistrictHistory,
} from "../server/services/district-history";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-district-history-")),
  "test.sqlite",
);
const { db, all, one } = await import("../server/database");
const { mutate } = await import("../server/services/changes");

beforeEach(() => {
  db().exec(
    "DELETE FROM levelHistory; DELETE FROM ratingHistory; DELETE FROM changes; DELETE FROM records; DELETE FROM districtExtras; DELETE FROM players; DELETE FROM levels;",
  );
  const add = db().prepare(
    "INSERT INTO levels(id,name,globalRank,localRank,status,verifiedLocal) VALUES(?,?,?,?,'main',1)",
  );
  for (let rank = 1; rank <= 3; rank++)
    add.run(rank, `Level ${rank}`, rank, rank);
});
afterEach(() => vi.unstubAllGlobals());

describe("Склонение районов в истории изменений", () => {
  it.each([
    ["Колпинский", "Колпинского"],
    ["Курортный", "Курортного"],
    ["Петродворцовый", "Петродворцового"],
    ["Адмиралтейский", "Адмиралтейского"],
    ["Гатчинский муниципальный округ", "Гатчинского муниципального округа"],
    ["Сосновоборский городской округ", "Сосновоборского городского округа"],
  ])("склоняет %s", (name, expected) => {
    expect(districtGenitive(name)).toBe(expected);
    expect(districtGenitive(expected)).toBe(expected);
  });

  it("исправляет только точные имена соседних районов, сохраняя ручной текст", () => {
    const names = [
      "Гатчинский муниципальный округ",
      "Колпинский",
      "Курортный",
      "Невский",
    ];
    const original =
      "Гатчинский вошёл в рейтинг на 16 место с 128.10 очками выше Колпинский и ниже Курортный. Моя заметка: выше Невский парк";
    const formatted = formatDistrictHistory(original, names);
    expect(formatted).toBe(
      "Гатчинский вошёл в рейтинг на 16 место с 128.10 очками выше Колпинского и ниже Курортного. Моя заметка: выше Невский парк",
    );
    expect(formatDistrictHistory(formatted, names)).toBe(formatted);
    expect(
      formatDistrictHistory(
        "выше Гатчинский муниципальный округ и ниже Колпинский",
        names,
      ),
    ).toBe("выше Гатчинского муниципального округа и ниже Колпинского");
  });

  it("записывает новые события районов со склонёнными соседями", () => {
    const districtId = (name: string) =>
      one<{ id: number }>("SELECT id FROM districts WHERE name=?", name)!.id;
    const add = db().prepare(
      "INSERT INTO districtExtras(districtId,levelId) VALUES(?,?)",
    );
    add.run(districtId("Курортный"), 1);
    add.run(districtId("Колпинский"), 3);
    mutate("Completion", null, () =>
      add.run(districtId("Гатчинский муниципальный округ"), 2),
    );
    const event = one<{ title: string }>(
      "SELECT title FROM changes WHERE kind='district-rating' AND entityId=?",
      districtId("Гатчинский муниципальный округ"),
    );
    expect(event?.title).toMatch(
      /^Гатчинский муниципальный округ вошёл в рейтинг на 2 место с [\d.]+ очками выше Колпинского и ниже Курортного$/,
    );
  });

  it("не склоняет ники игроков, совпадающие с названием района", () => {
    db().exec(`
      INSERT INTO players(id,name) VALUES(1,'Курортный'),(2,'Колпинский'),(3,'Гатчинский');
      INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,1,100),(2,3,100);
    `);
    mutate("Completion", null, () =>
      db()
        .prepare(
          "INSERT INTO records(playerId,levelId,manualPercent) VALUES(3,2,100)",
        )
        .run(),
    );
    const event = one<{ title: string }>(
      "SELECT title FROM changes WHERE kind='player-rating' AND entityId=3",
    );
    expect(event?.title).toMatch(/выше Колпинский и ниже Курортный$/);
  });

  it("показывает старые события со склонением без перезаписи базы и других вкладок", async () => {
    const title =
      "Моя правка: выше Колпинский и ниже Курортный. Ручное пояснение сохранено";
    const add = db().prepare(
      "INSERT INTO changes(kind,title,updatedAt) VALUES(?,?,'manual-version')",
    );
    for (const kind of ["district-rating", "player-rating", "level"])
      add.run(kind, title);
    const before = all("SELECT * FROM changes");
    let kind = "district-rating";
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("getQuery", () => ({ kind }));
    const handler = (await import("../server/api/changes.get")).default;
    expect((await handler({} as never))[0]?.title).toBe(
      "Моя правка: выше Колпинского и ниже Курортного. Ручное пояснение сохранено",
    );
    for (kind of ["player-rating", "level"])
      expect((await handler({} as never))[0]?.title).toBe(title);
    expect(all("SELECT * FROM changes")).toEqual(before);
  });

  it("склоняет соседей в старом событии с кавычками вокруг районов", async () => {
    const title =
      "«Гатчинский» вошёл в рейтинг на 16 место с 128.10 очками выше «Колпинский» и ниже «Курортный»";
    db()
      .prepare(
        "INSERT INTO changes(kind,title,updatedAt) VALUES('district-rating',?,'manual-version')",
      )
      .run(title);
    const before = all("SELECT * FROM changes");
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("getQuery", () => ({ kind: "district-rating" }));
    const handler = (await import("../server/api/changes.get")).default;
    expect((await handler({} as never))[0]?.title).toBe(
      "Гатчинский вошёл в рейтинг на 16 место с 128.10 очками выше Колпинского и ниже Курортного",
    );
    expect(all("SELECT * FROM changes")).toEqual(before);
  });
});
