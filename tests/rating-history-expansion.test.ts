import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatHistoryText } from "../server/services/list-events";
import { districtSubject } from "../server/services/district-history";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-movements-")),
  "test.sqlite",
);
const { db, all, one } = await import("../server/database");
const { migrateRatingHistory } =
  await import("../server/database/rating-history");
const { mutate } = await import("../server/services/changes");
const { editHistory, deleteHistoryBatch, createHistoryEvent } =
  await import("../server/services/history-editor");
const date = "2026-10-08T12:00:00.000Z";

beforeEach(() => {
  migrateRatingHistory(db());
  db().exec(
    "DELETE FROM ratingHistory; DELETE FROM levelHistory; DELETE FROM changes; DELETE FROM records; DELETE FROM districtExtras; DELETE FROM players; DELETE FROM levels; DELETE FROM settings WHERE key='mikaGlobalCutoff';",
  );
  db().exec(`
    INSERT INTO levels(id,name,globalRank,localRank,status,verifiedLocal) VALUES(1,'Hard',1,1,'main',1),(2,'Middle',2,2,'main',1),(3,'Easy',3,3,'main',1);
    INSERT INTO players(id,name,districtId) VALUES(1,'First',1),(2,'Second',2);
    INSERT INTO records(playerId,levelId,manualPercent) VALUES(1,2,100),(2,3,100);
  `);
});
afterEach(() => vi.unstubAllGlobals());

describe("Полная история перемещений", () => {
  it("сохраняет косвенное движение игрока и района и каскадно удаляет записи каждого типа", () => {
    mutate("New completion", 7, () =>
      db()
        .prepare(
          "INSERT INTO records(playerId,levelId,manualPercent) VALUES(2,1,100)",
        )
        .run(),
    );
    const player = one<{ id: number }>(
      "SELECT id FROM changes WHERE kind='player-rating' AND entityId=2",
    )!;
    const district = one<{ id: number }>(
      "SELECT id FROM changes WHERE kind='district-rating' AND entityId=2",
    )!;
    expect(
      one(
        "SELECT fromRank,rank,note,changeId FROM ratingHistory WHERE entityType='players' AND entityId=1",
      ),
    ).toEqual({
      fromRank: 1,
      rank: 2,
      note: "Second поднялся выше этого игрока",
      changeId: player.id,
    });
    expect(
      one<{ note: string }>(
        "SELECT note FROM ratingHistory WHERE entityType='districts' AND entityId=1",
      )!.note,
    ).toBe("Василеостровский район поднялся выше этого района");
    editHistory("changes", player.id, { updatedAt: null }, 7, true);
    expect(
      all("SELECT id FROM ratingHistory WHERE entityType='players'"),
    ).toEqual([]);
    expect(
      all("SELECT id FROM ratingHistory WHERE entityType='districts'"),
    ).toHaveLength(2);
    deleteHistoryBatch({ events: [{ id: district.id, updatedAt: null }] }, 7);
    expect(all("SELECT * FROM ratingHistoryCauses")).toEqual([]);
    expect(all("SELECT id FROM ratingHistory")).toEqual([]);
    expect(all("SELECT id FROM records")).toHaveLength(3);
  });

  it("связывает с каждым из нескольких причинных событий и удаляет запись при удалении любого", () => {
    db().exec(
      "INSERT INTO players(id,name,districtId) VALUES(3,'Third',3); INSERT INTO records(playerId,levelId,manualPercent) VALUES(3,3,100);",
    );
    mutate("Two improvements", 7, () =>
      db().exec(
        "INSERT INTO records(playerId,levelId,manualPercent) VALUES(2,1,100),(3,1,100);",
      ),
    );
    const history = one<{ id: number }>(
      "SELECT id FROM ratingHistory WHERE entityType='players' AND entityId=1",
    )!;
    const causes = all<{ changeId: number }>(
      "SELECT changeId FROM ratingHistoryCauses WHERE historyId=?",
      history.id,
    );
    expect(causes).toHaveLength(2);
    editHistory("changes", causes[1]!.changeId, { updatedAt: null }, 7, true);
    expect(
      one("SELECT id FROM ratingHistory WHERE id=?", history.id),
    ).toBeUndefined();
  });

  it("фиксирует скрытие и возврат игрока без новых рекордов", () => {
    mutate("Hide", 7, () =>
      db().prepare("UPDATE players SET hidden=1 WHERE id=1").run(),
    );
    expect(
      one(
        "SELECT fromRank,rank FROM ratingHistory WHERE entityType='players' AND entityId=1",
      ),
    ).toEqual({ fromRank: 1, rank: null });
    mutate("Show", 7, () =>
      db().prepare("UPDATE players SET hidden=0 WHERE id=1").run(),
    );
    expect(
      all(
        "SELECT fromRank,rank FROM ratingHistory WHERE entityType='players' AND entityId=1 ORDER BY id",
      ),
    ).toEqual([
      { fromRank: 1, rank: null },
      { fromRank: null, rank: 1 },
    ]);
  });

  it("редактирует историю позиций без изменения рейтинга и защищает версию", () => {
    mutate("New completion", 7, () =>
      db()
        .prepare(
          "INSERT INTO records(playerId,levelId,manualPercent) VALUES(2,1,100)",
        )
        .run(),
    );
    const history = one<{ id: number }>(
      "SELECT id FROM ratingHistory WHERE entityType='players' AND entityId=1",
    )!;
    const body = {
      updatedAt: null,
      fromRank: 2,
      toRank: 4,
      note: "Ручная заметка",
      createdAt: date,
    };
    editHistory("ratings", history.id, body, 7);
    expect(
      one(
        "SELECT fromRank,rank,note FROM ratingHistory WHERE id=?",
        history.id,
      ),
    ).toEqual({ fromRank: 2, rank: 4, note: "Ручная заметка" });
    expect(() => editHistory("ratings", history.id, body, 7)).toThrow(
      "уже изменено",
    );
    expect(all("SELECT id FROM records")).toHaveLength(3);
  });
});

describe("Ручные события и пакетное удаление", () => {
  it("сохраняет типизированную ссылку и дату без перемещений рейтинга", () => {
    for (const kind of ["level", "player-rating", "district-rating"]) {
      const result = createHistoryEvent(
        {
          kind,
          entityId: 1,
          title: "Новая запись. Примечание.",
          createdAt: date,
        },
        7,
      );
      expect(
        one(
          "SELECT kind,entityId,title,createdAt,public FROM changes WHERE id=?",
          result.id,
        ),
      ).toEqual({
        kind,
        entityId: 1,
        title: "Новая запись, Примечание",
        createdAt: date,
        public: 1,
      });
    }
    expect(all("SELECT * FROM ratingHistory")).toEqual([]);
    expect(
      all("SELECT * FROM changes WHERE kind='history-create' AND public=0"),
    ).toHaveLength(3);
    expect(() =>
      createHistoryEvent(
        { kind: "account", entityId: 1, title: "No", createdAt: date },
        7,
      ),
    ).toThrow();
    expect(() =>
      createHistoryEvent(
        { kind: "level", entityId: 999, title: "No", createdAt: date },
        7,
      ),
    ).toThrow("не найден");
    expect(() =>
      createHistoryEvent(
        { kind: "level", entityId: 1, title: "«»", createdAt: date },
        7,
      ),
    ).toThrow("Введите текст");
  });

  it("откатывает всё пакетное удаление при устаревшей версии одного события", () => {
    const first = createHistoryEvent(
      { kind: "level", entityId: 1, title: "First", createdAt: date },
      7,
    );
    const second = createHistoryEvent(
      { kind: "level", entityId: 2, title: "Second", createdAt: date },
      7,
    );
    editHistory(
      "changes",
      second.id,
      { title: "Updated", createdAt: date, updatedAt: null },
      7,
    );
    expect(() =>
      deleteHistoryBatch(
        {
          events: [
            { id: first.id, updatedAt: null },
            { id: second.id, updatedAt: null },
          ],
        },
        7,
      ),
    ).toThrow("уже изменено");
    expect(one("SELECT deletedAt FROM changes WHERE id=?", first.id)).toEqual({
      deletedAt: null,
    });
    expect(all("SELECT * FROM changes WHERE kind='history-delete'")).toEqual(
      [],
    );
    expect(() =>
      deleteHistoryBatch(
        {
          events: [
            { id: first.id, updatedAt: null },
            { id: first.id, updatedAt: null },
          ],
        },
        7,
      ),
    ).toThrow();
    expect(() => deleteHistoryBatch({ events: [] }, 7)).toThrow();
  });

  it("API проверяет право до чтения тела для создания и пакетного удаления", async () => {
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    const denied = vi.fn().mockRejectedValue(new Error("Нет прав"));
    const read = vi.fn();
    vi.stubGlobal("requirePermission", denied);
    vi.stubGlobal("readBody", read);
    const create = (await import("../server/api/admin/history/index.post"))
      .default;
    const remove = (await import("../server/api/admin/history/batch.delete"))
      .default;
    for (const handler of [create, remove])
      await expect(handler({} as never)).rejects.toThrow("Нет прав");
    expect(denied).toHaveBeenCalledWith({}, "history:write");
    expect(read).not.toHaveBeenCalled();
  });
});

describe("Коррекция прошлой истории", () => {
  it("сохраняет точки внутри имён и очков, меняет только разделители и вылеты", () => {
    expect(
      formatHistoryText(
        "Mr. Easy поставлен в топ. Test вылетел в Legacy list. Балл 128.10.",
        ["Mr. Easy"],
      ),
    ).toBe(
      "Mr. Easy поставлен в топ, Test вылетает в Legacy list, Балл 128.10",
    );
    expect(formatHistoryText("Выше Mr.", ["Mr."])).toBe("Выше Mr.");
    expect(districtSubject("Гатчинский муниципальный округ")).toBe(
      "Гатчинский муниципальный округ",
    );
    expect(districtSubject("Колпинский")).toBe("Колпинский район");
  });

  it("связывает только однозначные старые записи, удаляет детей удалённых событий и повторно не меняет ручные правки", () => {
    db()
      .prepare(
        "DELETE FROM settings WHERE key='ratingHistoryExpansion20261009'",
      )
      .run();
    db().exec(`
      INSERT INTO changes(id,kind,entityId,title,beforeJson,afterJson,createdAt,deletedAt) VALUES
        (10,'player-rating',1,'First поднялся.','{"rank":2,"score":150}','{"rank":1,"score":140}','${date}',NULL),
        (11,'district-rating',1,'Адмиралтейский поднялся. Моя заметка.','{"rank":2,"score":150}','{"rank":1,"score":140}','${date}','${date}');
      INSERT INTO ratingHistory(entityType,entityId,rank,score,results,reason,createdAt) VALUES('players',1,1,140,'[]','Old','${date}'),('districts',1,1,140,'[]','Old','${date}');
    `);
    migrateRatingHistory(db());
    expect(one("SELECT changeId,fromRank FROM ratingHistory")).toEqual({
      changeId: 10,
      fromRank: 2,
    });
    expect(
      one<{ title: string }>("SELECT title FROM changes WHERE id=11")!.title,
    ).toBe("Адмиралтейский район поднялся, Моя заметка");
    db()
      .prepare("UPDATE changes SET title='Моя новая правка.' WHERE id=10")
      .run();
    const before = all("SELECT * FROM changes");
    migrateRatingHistory(db());
    expect(all("SELECT * FROM changes")).toEqual(before);
  });

  it("восстанавливает однозначную связь после ручной правки даты родителя, но не угадывает при повторных результатах", () => {
    db()
      .prepare(
        "DELETE FROM settings WHERE key='ratingHistoryExpansion20261009'",
      )
      .run();
    db().exec(`
      INSERT INTO changes(id,kind,entityId,title,beforeJson,afterJson,createdAt) VALUES
        (10,'player-rating',1,'First поднялся','{"rank":2}','{"rank":1,"score":140}','2026-10-01T12:00:00.000Z'),
        (11,'player-rating',2,'Second поднялся','{"rank":2}','{"rank":1,"score":141}','2026-10-01T12:00:00.000Z');
      INSERT INTO ratingHistory(entityType,entityId,rank,score,results,reason,createdAt) VALUES
        ('players',1,1,140,'[]','Old','${date}'),
        ('players',2,1,141,'[]','Old','${date}'),
        ('players',2,1,141,'[]','Repeated','${date}');
    `);
    migrateRatingHistory(db());
    expect(one("SELECT changeId FROM ratingHistory WHERE entityId=1")).toEqual({
      changeId: 10,
    });
    expect(all("SELECT changeId FROM ratingHistory WHERE entityId=2")).toEqual([
      { changeId: null },
      { changeId: null },
    ]);
  });
});
