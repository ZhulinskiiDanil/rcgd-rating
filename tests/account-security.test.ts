import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { migrateAccountSecurity } from "../server/database/account-security";
import { sessionMatchesAccount } from "../server/services/account-session";

let connection: Database.Database;
vi.mock("../server/database", () => ({
  db: () => connection,
  one: (sql: string, ...values: (string | number | null)[]) =>
    connection.prepare(sql).get(...values),
  account: (id: number) => {
    const row = connection
      .prepare("SELECT * FROM accounts WHERE id=?")
      .get(id) as Record<string, unknown> | undefined;
    return row
      ? { ...row, permissions: JSON.parse(row.permissions as string) }
      : undefined;
  },
}));
vi.mock("../server/services/changes", () => ({ logChange: vi.fn() }));

const { resolveOAuthIdentity } =
  await import("../server/services/oauth-identity");
const {
  authenticatePassword,
  changeOwnPassword,
  isRecentOAuthProof,
  accountDestination,
} = await import("../server/services/password-account");
const { hashSecret } = await import("../server/services/password");
const { applyAccountAdminPatch } =
  await import("../server/services/account-admin");
const { saveOwnAvatar } = await import("../server/services/account-avatar");
const { currentAccount } = await import("../server/utils/access");
const row = (id: number) =>
  connection.prepare("SELECT * FROM accounts WHERE id=?").get(id) as any;

beforeEach(() => {
  connection = new Database(":memory:");
  connection.pragma("foreign_keys = ON");
  connection.exec(`
    CREATE TABLE accounts(id INTEGER PRIMARY KEY,login TEXT NOT NULL COLLATE NOCASE UNIQUE,nickname TEXT NOT NULL DEFAULT '',passwordHash TEXT,permissions TEXT NOT NULL DEFAULT '[]',headAdmin INTEGER NOT NULL DEFAULT 0,disabled INTEGER NOT NULL DEFAULT 0,discordAvatar TEXT,googleAvatar TEXT,avatarUrl TEXT NOT NULL DEFAULT '');
    CREATE TABLE identities(provider TEXT NOT NULL,subject TEXT NOT NULL,accountId INTEGER NOT NULL REFERENCES accounts(id),PRIMARY KEY(provider,subject),UNIQUE(provider,accountId));
    CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT NOT NULL,accountId INTEGER REFERENCES accounts(id),deletedAt TEXT);
    INSERT INTO accounts(id,login,nickname,passwordHash,headAdmin) VALUES(7,'Original owner','Original owner','preserved-hash',1),(8,'Member','Member','another-hash',0);
    INSERT INTO identities VALUES('discord','12345678',7),('discord','23456789',8),('google','google-subject',8);
    INSERT INTO players VALUES(42,'Member',8,NULL);
  `);
  migrateAccountSecurity(connection);
});
afterEach(() => {
  connection.close();
  vi.unstubAllGlobals();
});

describe("Изоляция аккаунтов и сохранность существующих данных", () => {
  it("миграция сохраняет IDs, пароли, связи и настройки; ключи стабильны при повторном запуске", () => {
    const key = row(7).sessionKey;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(row(8).sessionKey).not.toBe(key);
    migrateAccountSecurity(connection);
    expect(row(7)).toMatchObject({
      id: 7,
      passwordHash: "preserved-hash",
      headAdmin: 1,
      sessionKey: key,
    });
    expect(connection.prepare("SELECT * FROM players").get()).toEqual({
      id: 42,
      name: "Member",
      accountId: 8,
      deletedAt: null,
    });
    expect(connection.prepare("SELECT * FROM identities").all()).toHaveLength(
      3,
    );
    connection.prepare("INSERT INTO accounts(login) VALUES ('new')").run();
    expect(row(9).sessionKey).toMatch(/^[0-9a-f]{64}$/);
    expect(row(9).sessionKey).not.toBe(key);
  });

  it("старый cookie с одним числовым ID и cookie от другой БД не получают доступ", () => {
    const owner = row(7);
    expect(sessionMatchesAccount({ user: { id: 7 } }, owner)).toBe(false);
    expect(
      sessionMatchesAccount(
        { user: { id: 7 }, secure: { accountKey: row(8).sessionKey } },
        owner,
      ),
    ).toBe(false);
    expect(
      sessionMatchesAccount(
        { user: { id: 7 }, secure: { accountKey: owner.sessionKey } },
        owner,
      ),
    ).toBe(true);
    expect(sessionMatchesAccount({}, owner)).toBe(false);
    expect(
      sessionMatchesAccount(
        { user: { id: 7 }, secure: { accountKey: owner.sessionKey } },
        { ...owner, disabled: 1 },
      ),
    ).toBe(false);
  });

  it("параллельные запросы разных сессий возвращают только свой аккаунт", async () => {
    const first = { context: { accountId: 7 } };
    const second = { context: { accountId: 8 } };
    vi.stubGlobal(
      "getUserSession",
      vi.fn(async (event: typeof first) => ({
        user: { id: event.context.accountId },
        secure: { accountKey: row(event.context.accountId).sessionKey },
      })),
    );
    const users = await Promise.all([
      currentAccount(first as any),
      currentAccount(second as any),
    ]);
    expect(users.map((user) => user?.id)).toEqual([7, 8]);
    expect(users.map((user) => user?.headAdmin)).toEqual([1, 0]);
    vi.stubGlobal(
      "getUserSession",
      vi.fn(async () => ({})),
    );
    expect(await currentAccount(first as any)).toBeNull();
  });

  it("совпадение ника с главным администратором не объединяет аккаунты и не выдаёт права", () => {
    expect(() => resolveOAuthIdentity("discord", "34567890", null)).toThrow(
      "не связан",
    );
    expect(
      connection.prepare("SELECT COUNT(*) AS count FROM accounts").get(),
    ).toEqual({ count: 2 });
    expect(row(7).login).toBe("Original owner");
  });

  it("вход существующего Discord сохраняет account ID, данные и ручной логин", () => {
    applyAccountAdminPatch(
      8,
      { login: "Edited login", nickname: "Same nickname" },
      7,
    );
    const key = row(8).sessionKey;
    expect(
      resolveOAuthIdentity(
        "discord",
        "23456789",
        "https://cdn.discordapp.com/example.png",
      ),
    ).toBe(8);
    expect(row(8)).toMatchObject({
      login: "Edited login",
      nickname: "Same nickname",
      sessionKey: key,
      passwordHash: "another-hash",
    });
    expect(
      connection.prepare("SELECT name FROM players WHERE id=42").get(),
    ).toEqual({ name: "Same nickname" });
  });

  it("новый Discord с ником старого Google не привязывается к старому аккаунту", () => {
    expect(() =>
      resolveOAuthIdentity("discord", "google-subject", null),
    ).toThrow("не связан");
    expect(resolveOAuthIdentity("google", "google-subject", null)).toBe(8);
    expect(
      connection
        .prepare("SELECT accountId FROM identities WHERE provider='google'")
        .get(),
    ).toEqual({ accountId: 8 });
  });

  it("отвязка Discord отзывает сессии без удаления аккаунта, данных или Google-связи", () => {
    const oldSession = {
      user: { id: 8 },
      secure: { accountKey: row(8).sessionKey },
    };
    applyAccountAdminPatch(8, { unlinkDiscord: true }, 7);
    expect(sessionMatchesAccount(oldSession, row(8))).toBe(false);
    expect(
      connection
        .prepare(
          "SELECT accountId FROM identities WHERE provider='discord' AND subject='23456789'",
        )
        .get(),
    ).toBeUndefined();
    expect(
      connection
        .prepare("SELECT accountId FROM identities WHERE provider='google'")
        .get(),
    ).toEqual({ accountId: 8 });
    expect(
      connection.prepare("SELECT accountId FROM players WHERE id=42").get(),
    ).toEqual({ accountId: 8 });
    expect(() => resolveOAuthIdentity("discord", "23456789", null)).toThrow(
      "не связан",
    );
  });
});

describe("Права и собственные аватарки", () => {
  it("запрещает обычному пользователю менять аккаунты или назначать себя главным", () => {
    expect(() => applyAccountAdminPatch(8, { headAdmin: true }, 8)).toThrow(
      "Недостаточно прав",
    );
    expect(row(8).headAdmin).toBe(0);
  });
  it.each([{ disabled: true }, { headAdmin: false }])(
    "сохраняет последнего главного администратора и откатывает операцию %j",
    (patch) => {
      const before = row(7);
      expect(() => applyAccountAdminPatch(7, patch, 7)).toThrow("последнему");
      expect(row(7)).toEqual(before);
      expect(
        connection
          .prepare("SELECT accountId FROM identities WHERE subject='12345678'")
          .get(),
      ).toEqual({ accountId: 7 });
    },
  );
  it("поддерживает второго главного администратора и атомарную передачу прав", () => {
    applyAccountAdminPatch(8, { headAdmin: true }, 7);
    expect([row(7).headAdmin, row(8).headAdmin]).toEqual([1, 1]);
    applyAccountAdminPatch(7, { transferHeadAdminTo: 8 }, 7);
    expect([row(7).headAdmin, row(8).headAdmin]).toEqual([0, 1]);
    expect(() => applyAccountAdminPatch(7, { headAdmin: true }, 7)).toThrow(
      "Недостаточно прав",
    );
  });
  it("не передаёт управление аккаунту без доступного способа входа", () => {
    connection
      .prepare("INSERT INTO accounts(id,login) VALUES (20,'unlinked')")
      .run();
    expect(() =>
      applyAccountAdminPatch(7, { transferHeadAdminTo: 20 }, 7),
    ).toThrow("способ");
    expect(row(7).headAdmin).toBe(1);
    expect(row(20).headAdmin).toBe(0);
  });
  it("меняет только собственный аватар, соблюдает запрет и его снятие", () => {
    const key = row(8).sessionKey;
    saveOwnAvatar(8, key, "https://example.com/member.png");
    expect(row(8).avatarUrl).toBe("https://example.com/member.png");
    expect(row(7).avatarUrl).toBe("");
    expect(() =>
      saveOwnAvatar(7, key, "https://example.com/owner.png"),
    ).toThrow("Войдите");
    applyAccountAdminPatch(8, { avatarLocked: true }, 7);
    expect(() => saveOwnAvatar(8, key, "")).toThrow("запретила");
    applyAccountAdminPatch(8, { avatarLocked: false }, 7);
    saveOwnAvatar(8, key, "");
    expect(row(8).avatarUrl).toBe("");
  });
  it("не отвязывает единственный способ входа последнего главного", () => {
    connection
      .prepare("UPDATE accounts SET passwordHash=NULL WHERE id=7")
      .run();
    expect(() => applyAccountAdminPatch(7, { unlinkDiscord: true }, 7)).toThrow(
      "последнему",
    );
  });
  it("разрешает отвязать Discord главному с сохранённым паролем", () => {
    applyAccountAdminPatch(7, { unlinkDiscord: true }, 7);
    expect(row(7)).toMatchObject({
      headAdmin: 1,
      passwordHash: "preserved-hash",
    });
  });
  it("разрешает совпадающие видимые ники, но сохраняет уникальность логина", () => {
    applyAccountAdminPatch(8, { nickname: "Original owner" }, 7);
    expect(row(8).nickname).toBe("Original owner");
    expect(() =>
      applyAccountAdminPatch(8, { login: "original OWNER" }, 7),
    ).toThrow("занят");
    expect(row(8).login).toBe("Member");
  });
  it("сохраняет форму с пустым ником и пустым получателем прав, не очищая имя игрока", () => {
    applyAccountAdminPatch(8, { nickname: "", transferHeadAdminTo: null }, 7);
    expect(row(8).nickname).toBe("");
    expect(
      connection.prepare("SELECT name FROM players WHERE id=42").get(),
    ).toEqual({ name: "Member" });
  });
});

describe("Пароль и безопасное восстановление старого аккаунта", () => {
  const password = "Existing-test-password-2026";
  it("вход по паролю проверяет уникальный логин и сразу ведёт к достижениям", () => {
    connection
      .prepare("UPDATE accounts SET passwordHash=? WHERE id=8")
      .run(hashSecret(password));
    expect(authenticatePassword("member", password).id).toBe(8);
    expect(accountDestination(8)).toBe("/players/42");
    expect(accountDestination(7)).toBe("/account/settings");
    expect(() => authenticatePassword("Member", "wrong")).toThrow("Неверный");
    expect(() => authenticatePassword("does-not-exist", password)).toThrow(
      "Неверный",
    );
    connection.prepare("UPDATE accounts SET disabled=1 WHERE id=8").run();
    expect(() => authenticatePassword("Member", password)).toThrow("Неверный");
  });
  it("OAuth-only аккаунт ставит пароль только после свежего подтверждения и сохраняет ID/статы", () => {
    connection
      .prepare("UPDATE accounts SET passwordHash=NULL WHERE id=8")
      .run();
    const key = row(8).sessionKey;
    expect(() => changeOwnPassword(8, key, { password }, false)).toThrow(
      "Подтвердите",
    );
    expect(resolveOAuthIdentity("discord", "23456789", null)).toBe(8);
    const newKey = changeOwnPassword(
      8,
      key,
      { password, login: "member-new-login" },
      true,
    );
    expect(newKey).not.toBe(key);
    expect(authenticatePassword("member-new-login", password).id).toBe(8);
    expect(accountDestination(8)).toBe("/players/42");
    expect(
      sessionMatchesAccount(
        { user: { id: 8 }, secure: { accountKey: key } },
        row(8),
      ),
    ).toBe(false);
    expect(
      connection.prepare("SELECT COUNT(*) AS count FROM identities").get(),
    ).toEqual({ count: 3 });
  });
  it("обычная смена пароля требует прежний пароль и не затрагивает другие аккаунты", () => {
    connection
      .prepare("UPDATE accounts SET passwordHash=? WHERE id=8")
      .run(hashSecret(password));
    const key = row(8).sessionKey,
      owner = row(7);
    expect(() =>
      changeOwnPassword(
        8,
        key,
        { password: "New-secure-password-2026", currentPassword: "wrong" },
        false,
      ),
    ).toThrow("действующий");
    expect(row(8).sessionKey).toBe(key);
    changeOwnPassword(
      8,
      key,
      { password: "New-secure-password-2026", currentPassword: password },
      false,
    );
    expect(authenticatePassword("Member", "New-secure-password-2026").id).toBe(
      8,
    );
    expect(row(7)).toEqual(owner);
  });
  it("истёкшее или поддельное время не разрешает восстановление", () => {
    const now = 1000000;
    expect(
      isRecentOAuthProof(
        { authMethod: "discord", reauthenticatedAt: now - 100 },
        now,
      ),
    ).toBe(true);
    expect(
      isRecentOAuthProof(
        { authMethod: "google", reauthenticatedAt: now - 600001 },
        now,
      ),
    ).toBe(false);
    expect(
      isRecentOAuthProof(
        { authMethod: "password", reauthenticatedAt: now },
        now,
      ),
    ).toBe(false);
    expect(
      isRecentOAuthProof(
        { authMethod: "discord", reauthenticatedAt: now + 1 },
        now,
      ),
    ).toBe(false);
    expect(isRecentOAuthProof(undefined, now)).toBe(false);
  });
  it("удалённый профиль не становится адресом перехода после входа", () => {
    connection
      .prepare("UPDATE players SET deletedAt='2026-10-07' WHERE id=42")
      .run();
    expect(accountDestination(8)).toBe("/account/settings");
  });
});
