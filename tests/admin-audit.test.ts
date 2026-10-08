import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAdminAudit } from "../server/services/admin-audit";

let connection: Database.Database;
beforeEach(() => {
  connection = new Database(":memory:");
  connection.exec(`
    CREATE TABLE accounts(id INTEGER PRIMARY KEY,login TEXT,nickname TEXT);
    CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT,accountId INTEGER,deletedAt TEXT);
    CREATE TABLE changes(id INTEGER PRIMARY KEY,kind TEXT,entityId INTEGER,title TEXT,beforeJson TEXT,afterJson TEXT,actorId INTEGER,createdAt TEXT,deletedAt TEXT);
    INSERT INTO accounts VALUES(1,'owner','Владелец'),(2,'senior','Старший');
    INSERT INTO players VALUES(5,'Player',2,NULL);
  `);
});
afterEach(() => connection.close());
function add(
  kind: string,
  actorId: number | null,
  title: string,
  before: unknown = null,
  after: unknown = null,
  deletedAt: string | null = null,
) {
  connection
    .prepare(
      "INSERT INTO changes(kind,entityId,title,beforeJson,afterJson,actorId,createdAt,deletedAt) VALUES(?,4,?,?,?,?,?,?)",
    )
    .run(
      kind,
      title,
      JSON.stringify(before),
      JSON.stringify(after),
      actorId,
      "2026-10-09T12:00:00.000Z",
      deletedAt,
    );
}

describe("Журнал действий администрации", () => {
  it("показывает старую запись даже с повреждёнными служебными данными", () => {
    add("admin-edit", 1, "Старое изменение");
    connection.prepare("UPDATE changes SET afterJson='invalid-json'").run();
    expect(listAdminAudit(connection, {}).items[0]).toMatchObject({
      title: "Старое изменение",
      fields: [],
    });
  });
  it("не раскрывает сохранённые значения, пароли, сессии и неизвестные поля", () => {
    add("account", 1, "Изменены настройки аккаунта", null, {
      fields: ["seniorAdmin", "passwordHash", "sessionKey", "custom-secret"],
      passwordHash: "secret-hash",
      sessionKey: "secret-session",
      password: "plaintext",
      seniorAdmin: true,
    });
    add("password-recovery", 2, "Выдан временный пароль", null, {
      accountId: 4,
      password: "temp-secret",
    });
    const result = listAdminAudit(connection, {});
    expect(result.items[0]).toMatchObject({
      actorName: "Player",
      fields: ["Аккаунт"],
    });
    expect(result.items[1]?.fields).toEqual(["Старший администратор"]);
    expect(JSON.stringify(result)).not.toMatch(
      /secret|plaintext|beforeJson|afterJson|passwordHash|sessionKey/,
    );
  });
  it("показывает только действия администраторов, включая удаление истории", () => {
    add(
      "history-delete",
      1,
      "Удалено событие",
      { event: { title: "Было", deletedAt: null } },
      { event: { title: "Было", deletedAt: "2026-10-09" } },
    );
    add(
      "admin-edit",
      1,
      "Изменён уровень",
      null,
      { fields: ["video"] },
      "2026-10-09",
    );
    add("level", 1, "Публичный пересчёт");
    add("record-date", null, "Автоматическое обновление");
    add("password", 2, "Пользователь меняет свой пароль");
    expect(
      listAdminAudit(connection, {}).items.map((row) => row.title),
    ).toEqual(["Изменён уровень", "Удалено событие"]);
    expect(
      listAdminAudit(connection, { kind: "history-delete" }).items[0]?.fields,
    ).toEqual(["Удаление"]);
  });
  it("фильтрует автора и тип, ищет буквальные символы, ограничивает страницы", () => {
    for (let i = 0; i < 55; i++) add("admin-edit", 1, `Изменение ${i}`);
    add("account", 2, "Изменение 100%_ok");
    const page = listAdminAudit(connection, { page: 2 });
    expect(page.total).toBe(56);
    expect(page.items).toHaveLength(6);
    expect(listAdminAudit(connection, { page: 999 }).page).toBe(2);
    expect(
      listAdminAudit(connection, { actorId: 2, kind: "account", search: "%_" })
        .items,
    ).toHaveLength(1);
    expect(listAdminAudit(connection, { actorId: 1, search: "%_" }).total).toBe(
      0,
    );
    expect(page.actors).toEqual([
      { id: 2, name: "Player" },
      { id: 1, name: "Владелец" },
    ]);
    expect(() => listAdminAudit(connection, { kind: "passwordHash" })).toThrow(
      "Некорректные",
    );
    expect(() => listAdminAudit(connection, { page: -1 })).toThrow(
      "Некорректные",
    );
  });
});
