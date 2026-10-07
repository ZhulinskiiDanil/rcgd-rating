import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-history-edit-")),
  "test.sqlite",
);
const { db, one, all } = await import("../server/database");
const { migrateHistoryEditing } =
  await import("../server/database/history-editing");
const { editHistory, historyTarget } =
  await import("../server/services/history-editor");
const createdAt = "2026-10-07T12:00:00.000Z";
beforeEach(() => {
  migrateHistoryEditing(db());
  db().exec("DELETE FROM levelHistory; DELETE FROM changes;");
  db()
    .prepare(
      "INSERT INTO changes(id,kind,entityId,title,createdAt) VALUES(1,'level',75,'«Level» был понижен',?)",
    )
    .run(createdAt);
  db()
    .prepare(
      "INSERT INTO levelHistory(id,levelId,fromRank,toRank,fromTier,toTier,changeId,note,createdAt) VALUES(1,75,75,76,'main','extended',1,'Old reason',?)",
    )
    .run(createdAt);
});
afterEach(() => vi.unstubAllGlobals());

describe("Редактирование истории", () => {
  it("повторная миграция сохраняет данные, новую дату и версии", () => {
    const edited = editHistory(
      "changes",
      1,
      { title: "New event", createdAt, updatedAt: null },
      7,
    );
    migrateHistoryEditing(db());
    expect(
      one<any>("SELECT title,updatedAt,deletedAt FROM changes WHERE id=1"),
    ).toEqual({
      title: "New event",
      updatedAt: edited.updatedAt,
      deletedAt: null,
    });
  });
  it("редактирует только публичный текст и дату, сохраняет приватный аудит", () => {
    editHistory(
      "changes",
      1,
      {
        title: "«Level» вернулся в Main list",
        createdAt: "2026-10-06T12:00:00.000Z",
        updatedAt: null,
      },
      7,
    );
    expect(one<any>("SELECT title,createdAt FROM changes WHERE id=1")).toEqual({
      title: "Level вернулся в Main list",
      createdAt: "2026-10-06T12:00:00.000Z",
    });
    const audit = one<any>(
      "SELECT kind,public,actorId,beforeJson FROM changes WHERE id>1",
    );
    expect(audit).toMatchObject({
      kind: "history-edit",
      public: 0,
      actorId: 7,
    });
    expect(JSON.parse(audit.beforeJson).event.title).toBe(
      "«Level» был понижен",
    );
    expect(
      one<any>("SELECT fromRank,toRank,note FROM levelHistory WHERE id=1"),
    ).toEqual({ fromRank: 75, toRank: 76, note: "Old reason" });
    expect(() =>
      editHistory(
        "changes",
        2,
        { title: "Rewrite audit", createdAt, updatedAt: null },
        7,
      ),
    ).toThrow("Событие не найдено");
  });
  it("не принимает посторонние поля, SQL-идентификаторы и несовместимые позиции", () => {
    expect(() => historyTarget("changes;DELETE FROM players", 1)).toThrow();
    expect(() => historyTarget("changes", "1 OR 1=1")).toThrow();
    expect(() =>
      editHistory(
        "changes",
        1,
        { title: "New", createdAt, updatedAt: null, public: 1 },
        7,
      ),
    ).toThrow();
    expect(() =>
      editHistory("changes", 1, { title: "«»", createdAt, updatedAt: null }, 7),
    ).toThrow("Введите текст");
    expect(() =>
      editHistory(
        "levels",
        1,
        {
          fromRank: 75,
          toRank: 76,
          fromTier: "main",
          toTier: "main",
          note: "",
          createdAt,
          updatedAt: null,
        },
        7,
      ),
    ).toThrow("Позиция не соответствует");
  });
  it("защищает от потери параллельных правок, в том числе при удалении", () => {
    const first = editHistory(
      "changes",
      1,
      { title: "First", createdAt, updatedAt: null },
      7,
    );
    expect(() =>
      editHistory(
        "changes",
        1,
        { title: "Stale", createdAt, updatedAt: null },
        7,
      ),
    ).toThrow("Событие уже изменено");
    expect(() =>
      editHistory("changes", 1, { updatedAt: null }, 7, true),
    ).toThrow("Событие уже изменено");
    expect(one<any>("SELECT title,deletedAt FROM changes WHERE id=1")).toEqual({
      title: "First",
      deletedAt: null,
    });
    editHistory("changes", 1, { updatedAt: first.updatedAt }, 7, true);
    expect(
      one<any>("SELECT deletedAt FROM changes WHERE id=1").deletedAt,
    ).toEqual(expect.any(String));
  });
  it("удаляет все связанные позиции безвозвратно и сохраняет несвязанную историю", async () => {
    db().exec(
      "INSERT INTO levelHistory(id,levelId,changeId,note,deletedAt) VALUES(2,76,1,'Related deleted','2026-10-07'),(3,77,999,'Unrelated',NULL)",
    );
    editHistory("changes", 1, { updatedAt: null }, 7, true);
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("getQuery", () => ({ kind: "level" }));
    const changes = (await import("../server/api/changes.get")).default;
    expect(await changes({} as never)).toEqual([]);
    expect(all("SELECT id FROM levelHistory")).toEqual([{ id: 3 }]);
    const audit = one<{ afterJson: string }>(
      "SELECT afterJson FROM changes WHERE kind='history-delete'",
    );
    expect(JSON.parse(audit!.afterJson).removedLevelEvents).toBe(2);
  });
  it("сохраняет осознанное пустое примечание и скрывает удалённое событие уровня", async () => {
    const result = editHistory(
      "levels",
      1,
      {
        fromRank: 75,
        toRank: 76,
        fromTier: "main",
        toTier: "extended",
        note: "",
        createdAt,
        updatedAt: null,
      },
      7,
    );
    expect(
      one<any>("SELECT note,noteEdited FROM levelHistory WHERE id=1"),
    ).toEqual({ note: "", noteEdited: 1 });
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("getQuery", () => ({ type: "levels", id: "75" }));
    const history = (await import("../server/api/history.get")).default;
    expect((await history({} as never))[0]).toMatchObject({ note: "" });
    editHistory("levels", 1, { updatedAt: result.updatedAt }, 7, true);
    expect(await history({} as never)).toEqual([]);
    expect(one<any>("SELECT deletedAt FROM changes WHERE id=1")).toEqual({
      deletedAt: null,
    });
  });
  it("убирает кавычки и у старых общих событий", async () => {
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("getQuery", () => ({ kind: "level" }));
    const changes = (await import("../server/api/changes.get")).default;
    expect((await changes({} as never))[0]?.title).toBe("Level был понижен");
  });
  it("API проверяет history:write до чтения тела и любых изменений", async () => {
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    const denied = vi.fn().mockRejectedValue(new Error("Недостаточно прав"));
    const read = vi.fn();
    vi.stubGlobal("requirePermission", denied);
    vi.stubGlobal("readBody", read);
    const patch = (
      await import("../server/api/admin/history/[type]/[id].patch")
    ).default;
    const remove = (
      await import("../server/api/admin/history/[type]/[id].delete")
    ).default;
    for (const handler of [patch, remove])
      await expect(handler({} as never)).rejects.toThrow("Недостаточно прав");
    expect(denied).toHaveBeenCalledWith({}, "history:write");
    expect(read).not.toHaveBeenCalled();
    expect(one<any>("SELECT title,deletedAt FROM changes WHERE id=1")).toEqual({
      title: "«Level» был понижен",
      deletedAt: null,
    });
  });
});
