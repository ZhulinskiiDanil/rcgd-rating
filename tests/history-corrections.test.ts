import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  correctHistoryTitle,
  migrateHistoryCorrections,
} from "../server/database/history-corrections";
import type { LevelMovement } from "../server/services/list-events";

const removed: LevelMovement = {
  levelId: 1,
  name: "Removed",
  fromRank: 13,
  toRank: null,
  fromTier: "main",
  toTier: null,
  note: "Удалён из листа",
};
const returned: LevelMovement = {
  levelId: 2,
  name: "Return. Level",
  fromRank: 76,
  toRank: 75,
  fromTier: "extended",
  toTier: "main",
  note: "Removed удалён из листа",
};
const legacy: LevelMovement = {
  levelId: 3,
  name: "Legacy",
  fromRank: null,
  toRank: 150,
  fromTier: "legacy",
  toTier: "extended",
  note: "Подвинут",
};
const fall: LevelMovement = {
  levelId: 4,
  name: "Fall",
  fromRank: 75,
  toRank: 76,
  fromTier: "main",
  toTier: "extended",
  note: "Подвинут",
};
let connection: Database.Database;
beforeEach(() => {
  connection = new Database(":memory:");
  connection.exec(`
    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE levels(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE changes(id INTEGER PRIMARY KEY,kind TEXT,public INTEGER,title TEXT,afterJson TEXT,deletedAt TEXT,updatedAt TEXT,entityId INTEGER);
    CREATE TABLE levelHistory(id INTEGER PRIMARY KEY,levelId INTEGER,changeId INTEGER,fromRank INTEGER,toRank INTEGER,fromTier TEXT,toTier TEXT,note TEXT,noteEdited INTEGER DEFAULT 0,deletedAt TEXT,updatedAt TEXT);
    CREATE INDEX level_history_entity ON levelHistory(levelId,id);
    INSERT INTO levels VALUES(1,'Removed'),(2,'Return. Level'),(3,'Legacy'),(4,'Fall');
  `);
});
afterEach(() => connection.close());

describe("Одноразовое исправление прошлой истории", () => {
  it("ставит удаление первым и обрезает только продолжения возвратов, сохраняя ручную заметку", () => {
    const title =
      "Моя заметка. Return. Level вернулся в Main list на 75 место (был на 76 месте) выше Legacy. Removed удалён из листа. Legacy вернулся в Extended list на 150 место ниже Fall";
    expect(correctHistoryTitle(title, [removed, returned, legacy])).toBe(
      "Removed удалён из листа. Моя заметка. Return. Level вернулся в Main list. Legacy вернулся в Extended list",
    );
    for (const old of [
      "переходит в",
      "перешёл в",
      "вылетел из Main list в",
      "вылетел в",
    ])
      expect(
        correctHistoryTitle(`Fall ${old} Extended list на 76 место`, [fall]),
      ).toBe("Fall вылетает в Extended list на 76 место");
    expect(
      correctHistoryTitle("Fall — ручная причина без автотекста", [fall]),
    ).toBe("Fall — ручная причина без автотекста");
  });

  it("каскадно очищает удалённые события, исправляет автотексты и сохраняет ручные правки", () => {
    const data = { movements: [removed, returned], custom: "keep" };
    connection
      .prepare(
        "INSERT INTO changes VALUES(1,'level',1,'Deleted',?, '2026-10-07',NULL,NULL)",
      )
      .run(JSON.stringify(data));
    connection
      .prepare(
        "INSERT INTO changes VALUES(2,'level',1,?,?,NULL,'2026-10-07',NULL)",
      )
      .run(
        "Моя заметка. Return. Level вернулся в Main list на 75 место (был на 76 месте). Removed удалён из листа",
        JSON.stringify(data),
      );
    const add = connection.prepare(
      "INSERT INTO levelHistory(id,levelId,changeId,fromRank,toRank,fromTier,toTier,note,noteEdited,deletedAt,updatedAt) VALUES(?,2,?,76,75,'extended','main',?,?,?,?)",
    );
    add.run(1, 2, "Removed удалён из листа", 0, null, null);
    add.run(
      2,
      2,
      "Removed удалён из листа — моя заметка",
      1,
      null,
      "manual-version",
    );
    add.run(3, 2, "", 1, null, "empty-version");
    add.run(4, 999, "Unrelated", 0, null, null);
    add.run(50, 1, "Deleted parent", 0, null, null);
    add.run(51, 1, "Already deleted child", 1, "2026-10-07", "old-version");
    migrateHistoryCorrections(connection);
    const event = connection
      .prepare("SELECT * FROM changes WHERE id=2")
      .get() as any;
    expect(event.title).toBe(
      "Removed удалён из листа. Моя заметка. Return. Level вернулся в Main list",
    );
    expect(event.updatedAt).not.toBe("2026-10-07");
    expect(event.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.parse(event.afterJson)).toMatchObject({
      custom: "keep",
      movements: [{}, { note: "Removed удалён с позиции выше" }],
    });
    expect(
      connection
        .prepare(
          "SELECT id,note,noteEdited,updatedAt FROM levelHistory ORDER BY id",
        )
        .all(),
    ).toEqual([
      {
        id: 1,
        note: "Removed удалён с позиции выше",
        noteEdited: 0,
        updatedAt: event.updatedAt,
      },
      {
        id: 2,
        note: "Removed удалён из листа — моя заметка",
        noteEdited: 1,
        updatedAt: "manual-version",
      },
      { id: 3, note: "", noteEdited: 1, updatedAt: "empty-version" },
      { id: 4, note: "Unrelated", noteEdited: 0, updatedAt: null },
    ]);
    expect(
      Number(
        connection.prepare("INSERT INTO levelHistory(levelId) VALUES(9)").run()
          .lastInsertRowid,
      ),
    ).toBe(52);
    expect(
      connection
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='level_history_entity'",
        )
        .get(),
    ).toBeTruthy();
    const snapshot = connection.prepare("SELECT * FROM settings").all();
    migrateHistoryCorrections(connection);
    expect(connection.prepare("SELECT * FROM settings").all()).toEqual(
      snapshot,
    );
    expect(
      connection.prepare("SELECT count(*) AS count FROM levelHistory").get(),
    ).toEqual({ count: 5 });
  });

  it("использует позиции уровня если старое общее событие не содержит movements", () => {
    connection.exec(`INSERT INTO changes VALUES(1,'level',1,'Fall переходит в Extended list на 76 место',NULL,NULL,NULL,NULL);
      INSERT INTO levelHistory(levelId,changeId,fromRank,toRank,fromTier,toTier,note) VALUES(4,1,75,76,'main','extended','Подвинут');`);
    migrateHistoryCorrections(connection);
    expect(connection.prepare("SELECT title FROM changes").get()).toEqual({
      title: "Fall вылетает в Extended list на 76 место",
    });
  });

  it("исправляет старые составные события и восстанавливает причину вылета в Legacy", () => {
    const imperial: LevelMovement = {
      levelId: 178,
      name: "IMPERIAL",
      fromRank: null,
      toRank: 48,
      fromTier: null,
      toTier: "main",
      note: "",
    };
    const twilight: LevelMovement = {
      levelId: 264,
      name: "Twilight",
      fromRank: 75,
      toRank: 76,
      fromTier: "main",
      toTier: "extended",
      note: "",
    };
    const mika: LevelMovement = {
      levelId: 500,
      name: "Mika",
      fromRank: 150,
      toRank: null,
      fromTier: "extended",
      toTier: "legacy",
      note: "",
    };
    const old =
      "IMPERIAL поставлен в топ на 48 место выше Hard Machine и ниже Trueffet. В связи с этим Twilight переходит в Extended list, Mika вылетает в Legacy list";
    expect(correctHistoryTitle(old, [imperial, twilight, mika], [], 178)).toBe(
      "Twilight вылетает в Extended list. IMPERIAL поставлен в топ на 48 место выше Hard Machine и ниже Trueffet. Mika вылетел в Legacy list. IMPERIAL поставлен выше этого уровня",
    );
    const reverse = [
      {
        ...imperial,
        fromRank: 48,
        toRank: null,
        fromTier: "main" as const,
        toTier: null,
      },
      {
        ...twilight,
        fromRank: 76,
        toRank: 75,
        fromTier: "extended" as const,
        toTier: "main" as const,
      },
      {
        ...mika,
        fromRank: null,
        toRank: 150,
        fromTier: "legacy" as const,
        toTier: "extended" as const,
      },
    ];
    expect(
      correctHistoryTitle(
        "Mika вернулся в Extended list на 150 место ниже Titan Complex. В связи с этим Twilight переходит в Main list",
        reverse,
        [],
        500,
      ),
    ).toBe(
      "IMPERIAL удалён из листа. Mika вернулся в Extended list. Twilight вернулся в Main list",
    );
  });

  it("заменяет Подвинут и пустую причину у возвращённого из Legacy уровня", () => {
    const data = { movements: [removed, { ...legacy, note: "Подвинут" }] };
    connection
      .prepare("INSERT INTO changes VALUES(1,'level',1,?,?,NULL,NULL,NULL)")
      .run(
        "Legacy вернулся в Extended list на 150 место. Removed удалён из листа",
        JSON.stringify(data),
      );
    connection.exec(
      "INSERT INTO levelHistory(levelId,changeId,fromRank,toRank,fromTier,toTier,note) VALUES(3,1,NULL,150,'legacy','extended','Подвинут')",
    );
    migrateHistoryCorrections(connection);
    expect(connection.prepare("SELECT note FROM levelHistory").get()).toEqual({
      note: "Removed удалён с позиции выше",
    });
    expect(
      JSON.parse(
        (connection.prepare("SELECT afterJson FROM changes").get() as any)
          .afterJson,
      ).movements[1].note,
    ).toBe("Removed удалён с позиции выше");
  });
});
