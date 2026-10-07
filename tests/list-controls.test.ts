import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-list-controls-")),
  "test.sqlite",
);
const { db, all, one, dataset } = await import("../server/database");
const { mutate } = await import("../server/services/changes");
const { applyGlobal, mergeRecords } = await import("../server/services/sync");
const { rankings } = await import("../server/services/rankings");
const { completedLevels, playerRating, reconcileList } =
  await import("../shared/utils/rating");
const globals = Array.from({ length: 151 }, (_, i) => ({
  id: i + 1,
  name: `Level ${i + 1}`,
  placement: i + 1,
}));
beforeEach(() => {
  db().exec(
    "DELETE FROM levelHistory;DELETE FROM ratingHistory;DELETE FROM changes;DELETE FROM districtExtras;DELETE FROM records;DELETE FROM players;DELETE FROM levels;",
  );
  db().prepare("DELETE FROM settings WHERE key='mikaGlobalCutoff'").run();
  const seed = db().prepare("INSERT INTO levels(id,gdlId,name) VALUES(?,?,?)");
  for (const level of globals) seed.run(level.id, level.id, level.name);
  applyGlobal(globals, null);
  mutate("Seed", null, () =>
    db().prepare("UPDATE levels SET verifiedLocal=1").run(),
  );
  db().exec(
    "DELETE FROM levelHistory;DELETE FROM ratingHistory;DELETE FROM changes;",
  );
});

describe("Границы листа, удаления и история", () => {
  it("разделяет Main и Extended, не создаёт Legacy для первоначального #151", () => {
    expect(one<any>("SELECT status FROM levels WHERE id=75").status).toBe(
      "main",
    );
    expect(one<any>("SELECT status FROM levels WHERE id=76").status).toBe(
      "extended",
    );
    expect(one<any>("SELECT status FROM levels WHERE id=150").status).toBe(
      "extended",
    );
    expect(
      one<any>("SELECT status,localRank FROM levels WHERE id=151"),
    ).toEqual({ status: "catalog", localRank: null });
  });
  it("собирает постановку и переходы75/150 в одно событие с подробной историей уровней", () => {
    mutate("New", null, () =>
      db()
        .prepare(
          "INSERT INTO levels(id,name,globalRank,verifiedLocal) VALUES(200,'New hardest',0,1)",
        )
        .run(),
    );
    const events = all<any>(
      "SELECT * FROM changes WHERE public=1 AND kind='level'",
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toContain("New hardest поставлен в топ на 1 место");
    expect(events[0].title).toMatch(
      /^Level 75 вылетел из Main list в Extended list/,
    );
    expect(events[0].title).toContain(
      "Level 150 вылетел в Legacy list с 150 места",
    );
    expect(all("SELECT * FROM levelHistory")).toHaveLength(151);
    expect(
      one<any>("SELECT status,localRank FROM levels WHERE id=150"),
    ).toEqual({ status: "legacy", localRank: null });
    expect(one<any>("SELECT status FROM levels WHERE id=151").status).toBe(
      "catalog",
    );
  });
  it("распознаёт одно понижение, не публикует149побочных повышений", () => {
    mutate("Move", null, () =>
      db().prepare("UPDATE levels SET globalRank=149.5 WHERE id=1").run(),
    );
    const events = all<any>(
      "SELECT title FROM changes WHERE public=1 AND kind='level'",
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toContain(
      "Level 1 вылетел из Main list в Extended list на 149 место (был на 1 месте)",
    );
    expect(events[0].title).not.toContain("Level 2 был повышен");
  });
  it("удалённый из листа уровень не становится Legacy и не возвращается после global sync", () => {
    mutate("Remove", null, () =>
      db().prepare("UPDATE levels SET listExcluded=1 WHERE id=1").run(),
    );
    mutate("Sync", null, () => applyGlobal(globals, null));
    expect(
      one<any>("SELECT status,localRank,listExcluded FROM levels WHERE id=1"),
    ).toEqual({ status: "catalog", localRank: null, listExcluded: 1 });
    expect(completedLevels(dataset()).some((level) => level.id === 1)).toBe(
      false,
    );
  });
  it("удалённый рекорд не восстанавливается новым принятым импортом", () => {
    db().prepare("INSERT INTO players(id,name) VALUES(1,'Player')").run();
    const record = {
      id: 1,
      percent: 100,
      status: "accepted",
      level: { id: 1, name: "Level 1", placement: 1 },
    };
    mergeRecords(1, [record]);
    db().prepare("UPDATE records SET active=0,deletedAt='2026-10-06'").run();
    mergeRecords(1, [{ ...record, id: 2 }]);
    expect(one<any>("SELECT importedId,active,deletedAt FROM records")).toEqual(
      { importedId: 1, active: 0, deletedAt: "2026-10-06" },
    );
    expect(playerRating(dataset(), 1).score).toBe(150);
  });
  it("не принимает новые импортированные результаты Legacy, сохраняя старые", () => {
    db().exec(
      "INSERT INTO players(id,name) VALUES(1,'Player'),(2,'Other'); INSERT INTO records(playerId,levelId,importedPercent,importedId) VALUES(1,150,90,1);",
    );
    mutate("New", null, () =>
      db()
        .prepare(
          "INSERT INTO levels(id,name,globalRank,verifiedLocal) VALUES(200,'New hardest',0,1)",
        )
        .run(),
    );
    const record = {
      id: 2,
      percent: 100,
      status: "accepted",
      level: { id: 150, name: "Level 150", placement: 150 },
    };
    mergeRecords(1, [record]);
    mergeRecords(2, [record]);
    expect(
      one<any>("SELECT importedPercent FROM records WHERE playerId=1")
        .importedPercent,
    ).toBe(90);
    expect(all("SELECT * FROM records WHERE playerId=2")).toHaveLength(0);
  });
  it("район с единственным#150 имеет rank несмотря наscore150; пустой районranknull", () => {
    mutate("District proof", null, () =>
      db()
        .prepare("INSERT INTO districtExtras(districtId,levelId) VALUES(1,150)")
        .run(),
    );
    const districts = rankings().districts;
    expect(districts.find((district) => district.id === 1)).toMatchObject({
      score: 150,
      completionCount: 1,
      rank: 1,
    });
    expect(districts.find((district) => district.id === 2)).toMatchObject({
      score: 150,
      completionCount: 0,
      rank: null,
    });
  });
  it("изменение балла без изменения места не создаёт историю рейтинга", () => {
    mutate("Player", null, () =>
      db().exec(
        "INSERT INTO players(id,name) VALUES(1,'Player'); INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,100,100);",
      ),
    );
    db().exec("DELETE FROM ratingHistory;DELETE FROM changes;");
    mutate("Better", null, () =>
      db()
        .prepare(
          "INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,1,100)",
        )
        .run(),
    );
    expect(
      all("SELECT * FROM ratingHistory WHERE entityType='players'"),
    ).toHaveLength(0);
    expect(
      all("SELECT * FROM changes WHERE kind='player-rating'"),
    ).toHaveLength(0);
  });
  it("customlevel получает ручное место, затем связывается поID без потери локальногоid/рекордов", () => {
    mutate("Custom", null, () =>
      db().exec(
        "INSERT INTO players(id,name) VALUES(1,'Player'); INSERT INTO levels(id,name,ingameId,manualPosition,verifiedLocal,showcaseVideo) VALUES(200,'Custom',987654,4,1,'https://example.com/custom'); INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,200,100);",
      ),
    );
    expect(
      one<any>("SELECT localRank FROM levels WHERE id=200").localRank,
    ).toBe(4);
    mutate("Link", null, () =>
      applyGlobal(
        [
          ...globals,
          { id: 5000, name: "Custom final", placement: 2, ingame_id: 987654 },
        ],
        null,
      ),
    );
    expect(
      one<any>(
        "SELECT id,gdlId,manualPosition,showcaseVideo FROM levels WHERE gdlId=5000",
      ),
    ).toEqual({
      id: 200,
      gdlId: 5000,
      manualPosition: null,
      showcaseVideo: "https://example.com/custom",
    });
    expect(one<any>("SELECT levelId FROM records").levelId).toBe(200);
  });
  it("не связывает custom с неоднозначным совпадением названия", () => {
    db().exec(
      "INSERT INTO levels(id,name,manualPosition,verifiedLocal) VALUES(200,'Duplicate',4,1)",
    );
    applyGlobal(
      [
        ...globals,
        { id: 5000, name: "Duplicate", placement: 2 },
        { id: 5001, name: "Duplicate", placement: 3 },
      ],
      null,
    );
    expect(one<any>("SELECT gdlId FROM levels WHERE id=200").gdlId).toBeNull();
  });
  it("чистыйreconcile убирает уровень без прохождений вcatalog, неLegacy", () => {
    const data = dataset();
    data.levels.find((level) => level.id === 1)!.verifiedLocal = 0;
    expect(reconcileList(data).find((level) => level.id === 1)).toMatchObject({
      status: "catalog",
      localRank: null,
    });
  });
});
