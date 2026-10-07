import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { verifySecret } from "../server/services/password";

let connection: Database.Database;
vi.mock("../server/database", () => ({
  db: () => connection,
  one: (sql: string, ...values: unknown[]) =>
    connection.prepare(sql).get(...values),
}));
const { initializeHeadAdmin } = await import("../server/services/initialize");

beforeEach(() => {
  connection = new Database(":memory:");
  connection.exec(`
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY,
      login TEXT UNIQUE,
      passwordHash TEXT,
      headAdmin INTEGER NOT NULL DEFAULT 0
    );
  `);
  vi.stubEnv("HEAD_ADMIN_LOGIN", "first-admin");
});

afterEach(() => {
  connection.close();
  vi.unstubAllEnvs();
});

describe("Пароль первого администратора", () => {
  it("принимает ровно 8 символов и сохраняет только хеш", () => {
    vi.stubEnv("HEAD_ADMIN_PASSWORD", "Eight123");
    expect(initializeHeadAdmin()).toBe(true);
    const account = connection.prepare("SELECT * FROM accounts").get() as {
      login: string;
      passwordHash: string;
      headAdmin: number;
    };
    expect(account.login).toBe("first-admin");
    expect(account.headAdmin).toBe(1);
    expect(account.passwordHash).not.toBe("Eight123");
    expect(verifySecret(account.passwordHash, "Eight123")).toBe(true);
  });

  it("отклоняет 7 символов, не создавая аккаунт", () => {
    vi.stubEnv("HEAD_ADMIN_PASSWORD", "Seven12");
    expect(initializeHeadAdmin).toThrow("минимум 8 символов");
    expect(connection.prepare("SELECT * FROM accounts").all()).toEqual([]);
  });

  it("не меняет пароль и права существующего администратора", () => {
    connection
      .prepare(
        "INSERT INTO accounts(login,passwordHash,headAdmin) VALUES(?,?,1)",
      )
      .run("existing-admin", "existing-hash");
    vi.stubEnv("HEAD_ADMIN_PASSWORD", "Seven12");
    const before = connection.prepare("SELECT * FROM accounts").all();
    expect(initializeHeadAdmin()).toBe(false);
    expect(connection.prepare("SELECT * FROM accounts").all()).toEqual(before);
  });
});
