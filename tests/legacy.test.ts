import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-legacy-test-")),
  "test.sqlite",
);
const { db, one } = await import("../server/database/index");
const { mutate } = await import("../server/services/changes");
const { resetLegacy } = await import("../server/services/legacy");
beforeEach(() => {
  db().exec(
    "DELETE FROM ratingHistory;DELETE FROM changes;DELETE FROM districtExtras;DELETE FROM records;DELETE FROM players;DELETE FROM levels;",
  );
  mutate("Initial list", null, () => {
    const add = db().prepare(
      "INSERT INTO levels(id,name,globalRank,verifiedLocal) VALUES(?,?,?,1)",
    );
    for (let id = 1; id <= 151; id++) add.run(id, `Level ${id}`, id);
  });
});
describe("Legacy начинается с новых вылетов", () => {
  it("не считает первоначальные уровни ниже топ-150 вылетевшими", () => {
    expect(one<any>("SELECT status FROM levels WHERE id=151")?.status).toBe(
      "catalog",
    );
    expect(
      one<any>("SELECT COUNT(*) AS total FROM levels WHERE status='legacy'")
        ?.total,
    ).toBe(0);
  });
  it("архивирует вытесненный уровень и сохраняет дату и последнее место", () => {
    mutate("New harder level", null, () => {
      db()
        .prepare(
          "INSERT INTO levels(id,name,globalRank,verifiedLocal) VALUES(152,?,0,1)",
        )
        .run("New hardest");
    });
    expect(
      one<any>("SELECT status,lastMainRank,exitedAt FROM levels WHERE id=150"),
    ).toMatchObject({
      status: "legacy",
      lastMainRank: 150,
      exitedAt: expect.any(String),
    });
  });
  it("очистка не удаляет рекорды и не отменяется следующей синхронизацией", () => {
    db()
      .prepare(
        "UPDATE levels SET status='legacy',exitedAt='2026-10-01',lastMainRank=150 WHERE id=151",
      )
      .run();
    db().prepare("INSERT INTO players(id,name) VALUES(1,'Player')").run();
    db()
      .prepare(
        "INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,151,100)",
      )
      .run();
    expect(resetLegacy()).toBe(1);
    mutate("Sync", null, () => {});
    expect(
      one<any>("SELECT status,exitedAt,lastMainRank FROM levels WHERE id=151"),
    ).toMatchObject({ status: "catalog", exitedAt: null, lastMainRank: null });
    expect(
      one<any>("SELECT manualPercent FROM records WHERE levelId=151")
        ?.manualPercent,
    ).toBe(100);
    expect(resetLegacy()).toBe(0);
  });
  it("очищенный уровень может вернуться в основной лист и затем попасть в Legacy заново", () => {
    db().prepare("UPDATE levels SET status='legacy' WHERE id=151").run();
    resetLegacy();
    mutate("Returns", null, () => {
      db().prepare("UPDATE levels SET globalRank=0 WHERE id=151").run();
    });
    expect(one<any>("SELECT status FROM levels WHERE id=151")?.status).toBe(
      "main",
    );
    mutate("Falls out again", null, () => {
      db().prepare("UPDATE levels SET globalRank=151 WHERE id=151").run();
    });
    expect(
      one<any>("SELECT status,exitedAt FROM levels WHERE id=151"),
    ).toMatchObject({ status: "legacy", exitedAt: expect.any(String) });
  });
});
