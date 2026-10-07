import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-history-")),
  "test.sqlite",
);
const { db, all, one } = await import("../server/database");
const { mutate } = await import("../server/services/changes");
const { applyGlobal } = await import("../server/services/sync");
const { storedLevelNote } = await import("../server/services/list-events");
const globals = Array.from({ length: 160 }, (_, index) => ({
  id: index + 1,
  name: `Level ${index + 1}`,
  placement: index + 1,
}));

function clearHistory() {
  db().exec(
    "DELETE FROM levelHistory; DELETE FROM ratingHistory; DELETE FROM changes;",
  );
}
const publicEvents = (kind: string) =>
  all<{ entityId: number; title: string; afterJson: string }>(
    "SELECT entityId,title,afterJson FROM changes WHERE public=1 AND kind=? ORDER BY id",
    kind,
  );
beforeEach(() => {
  db().exec(
    "DELETE FROM levelHistory; DELETE FROM ratingHistory; DELETE FROM changes; DELETE FROM records; DELETE FROM districtExtras; DELETE FROM players; DELETE FROM levels;",
  );
  db().prepare("DELETE FROM settings WHERE key='mikaGlobalCutoff'").run();
  const seed = db().prepare("INSERT INTO levels(id,gdlId,name) VALUES(?,?,?)");
  for (const level of globals) seed.run(level.id, level.id, level.name);
  applyGlobal(globals, null);
  mutate("Seed", null, () =>
    db().prepare("UPDATE levels SET verifiedLocal=1").run(),
  );
  clearHistory();
});

describe("Причины перестановок уровней", () => {
  it("восстанавливает старое примечание только из сохранённого единственного основного изменения", () => {
    const movements = [
      {
        levelId: 200,
        name: "New level",
        fromRank: null,
        toRank: 13,
        fromTier: null,
        toTier: "main",
      },
      {
        levelId: 75,
        name: "Level 75",
        fromRank: 75,
        toRank: 76,
        fromTier: "main",
        toTier: "extended",
      },
    ];
    expect(storedLevelNote(75, 200, JSON.stringify({ movements }))).toBe(
      "New level поставлен выше этого уровня",
    );
    expect(storedLevelNote(200, 200, JSON.stringify({ movements }))).toBe(
      "Добавлен в лист",
    );
    expect(storedLevelNote(75, null, JSON.stringify({ movements }))).toBe("");
    expect(storedLevelNote(75, 999, JSON.stringify({ movements }))).toBe("");
    expect(storedLevelNote(75, 200, "invalid JSON")).toBe("");
    expect(
      storedLevelNote(
        75,
        200,
        JSON.stringify({ movements: [...movements, movements[0]] }),
      ),
    ).toBe("");
  });
  it("новый #13 объясняет сдвиг #75, а не только ближайших соседей", () => {
    mutate("Add", null, () =>
      db()
        .prepare(
          "INSERT INTO levels(id,name,globalRank,verifiedLocal) VALUES(200,'New level',12.5,1)",
        )
        .run(),
    );
    expect(publicEvents("level")).toHaveLength(1);
    expect(
      one<{ note: string }>("SELECT note FROM levelHistory WHERE levelId=75")
        ?.note,
    ).toBe("New level поставлен выше этого уровня");
    expect(
      one<any>("SELECT fromRank,toRank FROM levelHistory WHERE levelId=75"),
    ).toEqual({ fromRank: 75, toRank: 76 });
    expect(
      one<{ note: string }>("SELECT note FROM levelHistory WHERE levelId=150")
        ?.note,
    ).toBe("New level поставлен выше этого уровня");
    expect(publicEvents("level")[0]?.title).toMatch(
      /^Level 75 вылетает в Extended list/,
    );
    expect(publicEvents("level")[0]?.title).toContain(
      "Level 150 вылетел в Legacy list с 150 места. New level поставлен выше этого уровня",
    );
    expect(publicEvents("level")[0]?.title).not.toMatch(/[«»"]/);
  });
  it("явно сообщает о возвращении из Extended в Main до остальных изменений", () => {
    mutate("Return to main", null, () =>
      db().prepare("UPDATE levels SET globalRank=74.5 WHERE id=76").run(),
    );
    const title = publicEvents("level")[0]?.title;
    expect(title).toMatch(/^Level 75 вылетает в Extended list/);
    expect(title).toMatch(/Level 76 вернулся в Main list$/);
    expect(title?.match(/Level 76 вернулся/g)).toHaveLength(1);
  });
  it("восстанавливает причину старого вылета в Legacy вместо общего Подвинут", () => {
    const movements = [
      {
        levelId: 200,
        name: "New level",
        fromRank: null,
        toRank: 13,
        fromTier: null,
        toTier: "main",
        note: "Добавлен в лист",
      },
      {
        levelId: 150,
        name: "Level 150",
        fromRank: 150,
        toRank: null,
        fromTier: "extended",
        toTier: "legacy",
        note: "Подвинут",
      },
    ];
    expect(storedLevelNote(150, null, JSON.stringify({ movements }))).toBe(
      "New level поставлен выше этого уровня",
    );
  });
  it("13 → 75 помечает сам уровень как подвинутый и объясняет сдвиги соседей", () => {
    mutate("Move down", null, () =>
      db().prepare("UPDATE levels SET globalRank=75.5 WHERE id=13").run(),
    );
    expect(publicEvents("level")).toHaveLength(1);
    expect(
      one<any>(
        "SELECT fromRank,toRank,note FROM levelHistory WHERE levelId=13",
      ),
    ).toEqual({ fromRank: 13, toRank: 75, note: "Подвинут" });
    expect(
      one<{ note: string }>("SELECT note FROM levelHistory WHERE levelId=50")
        ?.note,
    ).toBe("Level 13 поставили ниже этого уровня");
    expect(publicEvents("level")[0]?.title).not.toContain(
      "Level 50» был повышен",
    );
  });
  it("75 → 13 объясняет, какой уровень поставили выше остальных", () => {
    mutate("Move up", null, () =>
      db().prepare("UPDATE levels SET globalRank=12.5 WHERE id=75").run(),
    );
    expect(
      one<{ note: string }>("SELECT note FROM levelHistory WHERE levelId=50")
        ?.note,
    ).toBe("Level 75 поставили выше этого уровня");
  });
  it("удаление уровня начинается с удаления и объясняет все вызванные им повышения", () => {
    mutate("Remove higher", null, () =>
      db()
        .prepare(
          "UPDATE levels SET deletedAt='2026-10-08T10:00:00Z' WHERE id=13",
        )
        .run(),
    );
    const title = publicEvents("level")[0]?.title;
    expect(title).toMatch(/^Level 13 удалён из листа\. /);
    expect(title).toContain("Level 76 вернулся в Main list");
    expect(title).not.toMatch(/вернулся в (?:Main|Extended) list на/);
    expect(
      one<{ note: string }>("SELECT note FROM levelHistory WHERE levelId=50")
        ?.note,
    ).toBe("Level 13 удалён с позиции выше");
  });
  it("возврат #150 из Legacy после удаления верхнего уровня сохраняет причину", () => {
    mutate("Add", null, () =>
      db()
        .prepare(
          "INSERT INTO levels(id,name,globalRank,verifiedLocal) VALUES(200,'New hardest',0,1)",
        )
        .run(),
    );
    clearHistory();
    mutate("Remove", null, () =>
      db().prepare("UPDATE levels SET listExcluded=1 WHERE id=200").run(),
    );
    expect(
      one<{ note: string }>("SELECT note FROM levelHistory WHERE levelId=150")
        ?.note,
    ).toBe("New hardest удалён с позиции выше");
  });
  it("понижение ниже Mika сохраняет Legacy, дату и рекорды; возврат даёт одно событие", () => {
    db().prepare("UPDATE levels SET name='Mika' WHERE id=150").run();
    db().exec(
      "INSERT INTO players(id,name) VALUES(1,'Player'); INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,127,100);",
    );
    mutate("Drop", null, () =>
      db().prepare("UPDATE levels SET globalRank=151.5 WHERE id=127").run(),
    );
    expect(
      one<any>("SELECT status,exitedAt FROM levels WHERE id=127"),
    ).toMatchObject({ status: "legacy", exitedAt: expect.any(String) });
    expect(
      one<any>("SELECT manualPercent,deletedAt FROM records WHERE levelId=127"),
    ).toEqual({ manualPercent: 100, deletedAt: null });
    expect(publicEvents("level")).toHaveLength(1);
    expect(publicEvents("level")[0]?.title).toContain(
      "Level 127 вылетел в Legacy list с 127 места",
    );
    expect(publicEvents("level")[0]?.title).not.toContain(". Подвинут");
    expect(
      one<{ note: string }>("SELECT note FROM levelHistory WHERE levelId=128")
        ?.note,
    ).toBe("Level 127 поставили ниже этого уровня");
    clearHistory();
    mutate("Return", null, () =>
      db().prepare("UPDATE levels SET globalRank=127 WHERE id=127").run(),
    );
    const events = publicEvents("level");
    expect(events).toHaveLength(1);
    expect(events[0]?.title.match(/Level 127/g)).toHaveLength(1);
    expect(events[0]?.title).toContain("Level 127 вернулся в Extended list");
    expect(events[0]?.title).not.toContain("вернулся в Extended list на");
    expect(all("SELECT * FROM levelHistory WHERE levelId=127")).toHaveLength(1);
    expect(one<any>("SELECT status,exitedAt FROM levels WHERE id=127")).toEqual(
      { status: "extended", exitedAt: null },
    );
  });
});

describe("История рейтинга связана с достижениями", () => {
  it("публичная история скрывает старый пустой вход и сохраняет первое достижение на том же месте", async () => {
    db()
      .prepare(
        "INSERT INTO ratingHistory(entityType,entityId,rank,score,results,reason) VALUES('players',1,1,150,?,'Old empty entry')",
      )
      .run(JSON.stringify([{ kind: "empty" }]));
    const completion = db()
      .prepare(
        "INSERT INTO ratingHistory(entityType,entityId,rank,score,results,reason) VALUES('players',1,1,150,?,'First completion')",
      )
      .run(JSON.stringify([{ kind: "completion", levelId: 150 }]));
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("getQuery", () => ({ type: "players", id: "1" }));
    try {
      const handler = (await import("../server/api/history.get")).default;
      const rows = await handler({} as never);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: Number(completion.lastInsertRowid),
        score: 150,
        rank: 1,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("не публикует вход пустого игрока, но публикует его первый #150 даже при прежнем месте и балле", () => {
    mutate("Create", null, () =>
      db()
        .prepare("INSERT INTO players(id,name,districtId) VALUES(1,'Player',1)")
        .run(),
    );
    expect(publicEvents("player-rating")).toHaveLength(0);
    mutate("First completion", null, () =>
      db()
        .prepare(
          "INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,150,100)",
        )
        .run(),
    );
    expect(publicEvents("player-rating")).toHaveLength(1);
    expect(publicEvents("player-rating")[0]?.title).toContain(
      "Player вошёл в рейтинг на 1 место",
    );
    expect(publicEvents("district-rating")).toHaveLength(1);
    expect(
      one<any>(
        "SELECT rank,score FROM ratingHistory WHERE entityType='players'",
      ),
    ).toEqual({ rank: 1, score: 150 });
  });
  it("удаление последнего достижения сохраняет выход, даже если пустой игрок остаётся первым", () => {
    mutate("First completion", null, () =>
      db().exec(
        "INSERT INTO players(id,name,districtId) VALUES(1,'Player',1); INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,150,100);",
      ),
    );
    clearHistory();
    mutate("Remove", null, () =>
      db().prepare("UPDATE records SET active=0,deletedAt='2026-10-07'").run(),
    );
    expect(publicEvents("player-rating")).toHaveLength(1);
    expect(publicEvents("player-rating")[0]?.title).toContain(
      "Player больше не имеет результатов",
    );
    expect(
      one<any>("SELECT rank FROM ratingHistory WHERE entityType='players'"),
    ).toEqual({ rank: null });
    expect(publicEvents("district-rating")).toHaveLength(1);
  });
  it("новый рекорд публикует изменения только своего игрока и района", () => {
    mutate("Seed players", null, () =>
      db().exec(
        "INSERT INTO players(id,name,districtId) VALUES(1,'First',1),(2,'Second',2); INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,100,100),(2,120,100);",
      ),
    );
    clearHistory();
    mutate("Second improves", null, () =>
      db()
        .prepare(
          "INSERT INTO records(playerId,levelId,manualPercent) VALUES(2,1,100)",
        )
        .run(),
    );
    expect(
      publicEvents("player-rating").map((event) => event.entityId),
    ).toEqual([2]);
    expect(
      publicEvents("district-rating").map((event) => event.entityId),
    ).toEqual([2]);
    for (const event of [
      ...publicEvents("player-rating"),
      ...publicEvents("district-rating"),
    ])
      expect(event.title).not.toMatch(/[«»"]/);
  });
  it("перестановка глобала не создаёт историю игроков и районов с прежними рекордами", () => {
    mutate("Seed players", null, () =>
      db().exec(
        "INSERT INTO players(id,name,districtId) VALUES(1,'First',1),(2,'Second',2); INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,1,100),(2,2,100);",
      ),
    );
    clearHistory();
    mutate("Global move", null, () =>
      db().prepare("UPDATE levels SET globalRank=149.5 WHERE id=1").run(),
    );
    expect(publicEvents("player-rating")).toHaveLength(0);
    expect(publicEvents("district-rating")).toHaveLength(0);
    expect(all("SELECT * FROM ratingHistory")).toHaveLength(0);
  });
});
