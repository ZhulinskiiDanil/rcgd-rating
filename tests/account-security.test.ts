import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { migrateAccountSecurity } from "../server/database/account-security";
import { sessionMatchesAccount } from "../server/services/account-session";
import { createError } from "h3";

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
const { currentAccount, requireAccount, requireSeniorAdmin } =
  await import("../server/utils/access");
const { resetAccountPassword } =
  await import("../server/services/account-recovery");
const row = (id: number) =>
  connection.prepare("SELECT * FROM accounts WHERE id=?").get(id) as any;

beforeEach(() => {
  connection = new Database(":memory:");
  connection.pragma("foreign_keys = ON");
  connection.exec(`
    CREATE TABLE accounts(id INTEGER PRIMARY KEY,login TEXT NOT NULL COLLATE NOCASE UNIQUE,nickname TEXT NOT NULL DEFAULT '',passwordHash TEXT,permissions TEXT NOT NULL DEFAULT '[]',headAdmin INTEGER NOT NULL DEFAULT 0,disabled INTEGER NOT NULL DEFAULT 0,discordAvatar TEXT,googleAvatar TEXT,avatarUrl TEXT NOT NULL DEFAULT '');
    CREATE TABLE identities(provider TEXT NOT NULL,subject TEXT NOT NULL,accountId INTEGER NOT NULL REFERENCES accounts(id),PRIMARY KEY(provider,subject),UNIQUE(provider,accountId));
    CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT NOT NULL,accountId INTEGER UNIQUE REFERENCES accounts(id),deletedAt TEXT);
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

describe("Привязка профиля в настройках аккаунта", () => {
  beforeEach(() => {
    connection.exec(`
      INSERT INTO players VALUES(43,'Existing victor',NULL,NULL),(44,'Deleted victor',NULL,'2026-10-08');
      CREATE TABLE records(id INTEGER PRIMARY KEY,playerId INTEGER REFERENCES players(id),percent INTEGER);
      INSERT INTO records VALUES(1,42,100),(2,43,100),(3,43,85);
    `);
  });

  it("привязывает существующий профиль и сохраняет его имя, достижения и данные аккаунта", () => {
    const accountBefore = row(7);
    const recordsBefore = connection.prepare("SELECT * FROM records").all();
    const identitiesBefore = connection
      .prepare("SELECT * FROM identities")
      .all();
    applyAccountAdminPatch(
      7,
      { playerId: 43, nickname: accountBefore.nickname },
      7,
    );
    expect(row(7)).toEqual(accountBefore);
    expect(
      connection.prepare("SELECT * FROM players WHERE id=43").get(),
    ).toEqual({
      id: 43,
      name: "Existing victor",
      accountId: 7,
      deletedAt: null,
    });
    expect(accountDestination(7)).toBe("/players/43");
    expect(connection.prepare("SELECT * FROM records").all()).toEqual(
      recordsBefore,
    );
    expect(connection.prepare("SELECT * FROM identities").all()).toEqual(
      identitiesBefore,
    );
  });

  it("переносит связь на свободный профиль, сохраняя прежний профиль и его рекорды", () => {
    applyAccountAdminPatch(8, { playerId: 43 }, 7);
    expect(
      connection.prepare("SELECT accountId FROM players WHERE id=42").get(),
    ).toEqual({ accountId: null });
    expect(
      connection.prepare("SELECT accountId FROM players WHERE id=43").get(),
    ).toEqual({ accountId: 8 });
    expect(accountDestination(8)).toBe("/players/43");
    expect(
      connection.prepare("SELECT * FROM records WHERE playerId=42").all(),
    ).toEqual([{ id: 1, playerId: 42, percent: 100 }]);
  });

  it("снимает привязку только при явном пустом значении, не удаляя профиль", () => {
    applyAccountAdminPatch(8, { playerId: null }, 7);
    expect(accountDestination(8)).toBe("/account/settings");
    expect(
      connection.prepare("SELECT * FROM players WHERE id=42").get(),
    ).toEqual({ id: 42, name: "Member", accountId: null, deletedAt: null });
    expect(
      connection.prepare("SELECT COUNT(*) AS count FROM records").get(),
    ).toEqual({ count: 3 });
  });

  it("не меняет привязку, если поле не передано", () => {
    applyAccountAdminPatch(8, { login: "new-member-login" }, 7);
    expect(accountDestination(8)).toBe("/players/42");
    expect(row(8).login).toBe("new-member-login");
  });

  it("повторное сохранение текущей привязки не переименовывает профиль", () => {
    connection
      .prepare("UPDATE players SET name='Player display name' WHERE id=42")
      .run();
    applyAccountAdminPatch(8, { playerId: 42, nickname: "Member" }, 7);
    expect(
      connection
        .prepare("SELECT name,accountId FROM players WHERE id=42")
        .get(),
    ).toEqual({ name: "Player display name", accountId: 8 });
  });

  it("явное изменение ника применяется к выбранному профилю, не к отвязанному", () => {
    applyAccountAdminPatch(
      8,
      { playerId: 43, nickname: "New display name" },
      7,
    );
    expect(
      connection.prepare("SELECT name FROM players WHERE id=43").get(),
    ).toEqual({ name: "New display name" });
    expect(
      connection.prepare("SELECT name FROM players WHERE id=42").get(),
    ).toEqual({ name: "Member" });
  });

  it("не забирает чужой профиль и откатывает остальные поля запроса", () => {
    const before = row(7);
    expect(() =>
      applyAccountAdminPatch(7, { playerId: 42, nickname: "Changed" }, 7),
    ).toThrow("другому аккаунту");
    expect(row(7)).toEqual(before);
    expect(accountDestination(8)).toBe("/players/42");
    expect(accountDestination(7)).toBe("/account/settings");
  });

  it.each([44, 999])(
    "отклоняет удалённый или отсутствующий профиль %i и сохраняет текущую привязку",
    (playerId) => {
      expect(() => applyAccountAdminPatch(8, { playerId }, 7)).toThrow(
        "не найден",
      );
      expect(accountDestination(8)).toBe("/players/42");
    },
  );

  it("не разрешает обычному или заблокированному администратору менять привязки", () => {
    expect(() => applyAccountAdminPatch(8, { playerId: 43 }, 8)).toThrow(
      "Недостаточно прав",
    );
    connection.prepare("UPDATE accounts SET disabled=1 WHERE id=7").run();
    expect(() => applyAccountAdminPatch(8, { playerId: 43 }, 7)).toThrow(
      "Недостаточно прав",
    );
    expect(accountDestination(8)).toBe("/players/42");
  });

  it("может заменить привязку к удалённому профилю без нарушения уникальности", () => {
    connection
      .prepare("UPDATE players SET deletedAt='2026-10-08' WHERE id=42")
      .run();
    applyAccountAdminPatch(8, { playerId: 43 }, 7);
    expect(accountDestination(8)).toBe("/players/43");
    expect(
      connection.prepare("SELECT accountId FROM players WHERE id=42").get(),
    ).toEqual({ accountId: null });
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

describe("Восстановление пароля главным администратором", () => {
  it("сохраняет аккаунт, права, привязки и достижения; отзывает только сессии получателя", () => {
    const target = row(8),
      owner = row(7);
    const result = resetAccountPassword(8, 7);
    expect(result.login).toBe("Member");
    expect(result.password.length).toBeGreaterThanOrEqual(20);
    expect(row(8)).toMatchObject({
      id: 8,
      login: target.login,
      permissions: target.permissions,
      headAdmin: 0,
      passwordResetRequired: 1,
    });
    expect(row(8).passwordHash).not.toContain(result.password);
    expect(row(8).sessionKey).not.toBe(target.sessionKey);
    expect(row(7)).toEqual(owner);
    expect(connection.prepare("SELECT * FROM identities").all()).toHaveLength(
      3,
    );
    expect(
      connection.prepare("SELECT accountId FROM players WHERE id=42").get(),
    ).toEqual({ accountId: 8 });
    expect(authenticatePassword(result.login, result.password).id).toBe(8);
    expect(accountDestination(8)).toBe("/account/settings");
    const key = row(8).sessionKey;
    expect(() =>
      changeOwnPassword(
        8,
        key,
        { currentPassword: result.password, password: result.password },
        false,
      ),
    ).toThrow("отличаться");
    changeOwnPassword(
      8,
      key,
      {
        currentPassword: result.password,
        password: "My-personal-password-2026",
      },
      false,
    );
    expect(row(8).passwordResetRequired).toBe(0);
    expect(accountDestination(8)).toBe("/players/42");
    expect(() => authenticatePassword(result.login, result.password)).toThrow(
      "Неверный",
    );
    expect(
      authenticatePassword(result.login, "My-personal-password-2026").id,
    ).toBe(8);
  });
  it("не позволяет обычному или заблокированному аккаунту выдавать пароли, не сбрасывает собственный", () => {
    const before = row(7);
    expect(() => resetAccountPassword(7, 8)).toThrow("Недостаточно");
    expect(() => resetAccountPassword(7, 7)).toThrow("Свой пароль");
    expect(row(7)).toEqual(before);
    connection.prepare("UPDATE accounts SET disabled=1 WHERE id=7").run();
    expect(() => resetAccountPassword(8, 7)).toThrow("Недостаточно");
  });
  it("до смены временного пароля запрещает защищённые действия, включая обход через OAuth", async () => {
    const issued = resetAccountPassword(8, 7);
    vi.stubGlobal("createError", createError);
    vi.stubGlobal("getUserSession", async () => ({
      user: { id: 8 },
      secure: { accountKey: row(8).sessionKey },
    }));
    await expect(requireAccount({} as any)).rejects.toThrow("временный пароль");
    expect((await requireAccount({} as any, true)).id).toBe(8);
    expect(() =>
      changeOwnPassword(
        8,
        row(8).sessionKey,
        { password: "Another-password-2026" },
        true,
      ),
    ).toThrow("действующий пароль");
    changeOwnPassword(
      8,
      row(8).sessionKey,
      { currentPassword: issued.password, password: "Another-password-2026" },
      true,
    );
    expect((await requireAccount({} as any)).id).toBe(8);
  });
});

describe("Старший администратор", () => {
  it("главный назначает и снимает роль, контакт сохраняется без изменения пароля и профиля", () => {
    const before = row(8);
    applyAccountAdminPatch(
      8,
      { seniorAdmin: true, adminContact: "@member" },
      7,
    );
    expect(row(8)).toMatchObject({
      seniorAdmin: 1,
      headAdmin: 0,
      adminContact: "@member",
      sessionKey: before.sessionKey,
      passwordHash: before.passwordHash,
    });
    expect(accountDestination(8)).toBe("/players/42");
    migrateAccountSecurity(connection);
    expect(row(8).seniorAdmin).toBe(1);
    applyAccountAdminPatch(8, { seniorAdmin: false, adminContact: "" }, 7);
    expect(row(8)).toMatchObject({ seniorAdmin: 0, adminContact: "" });
  });

  it("старший выдаёт временный пароль главному, сохраняя его роль и данные", () => {
    applyAccountAdminPatch(8, { seniorAdmin: true }, 7);
    const owner = row(7),
      senior = row(8);
    const issued = resetAccountPassword(7, 8);
    expect(issued.login).toBe(owner.login);
    expect(issued.password.length).toBeGreaterThanOrEqual(20);
    expect(row(7)).toMatchObject({
      id: 7,
      headAdmin: 1,
      permissions: owner.permissions,
      passwordResetRequired: 1,
    });
    expect(row(7).sessionKey).not.toBe(owner.sessionKey);
    expect(row(8)).toEqual(senior);
    expect(authenticatePassword(issued.login, issued.password).id).toBe(7);
    expect(accountDestination(7)).toBe("/account/settings");
    expect(
      sessionMatchesAccount(
        { user: { id: 7 }, secure: { accountKey: owner.sessionKey } },
        row(7),
      ),
    ).toBe(false);
    expect(connection.prepare("SELECT * FROM identities").all()).toHaveLength(
      3,
    );
  });

  it("старший не назначает роли, не редактирует аккаунты и не сбрасывает собственный пароль", () => {
    applyAccountAdminPatch(8, { seniorAdmin: true }, 7);
    const senior = row(8),
      owner = row(7);
    for (const patch of [
      { headAdmin: true },
      { seniorAdmin: false },
      { permissions: ["history:write" as const] },
      { login: "Changed" },
    ])
      expect(() => applyAccountAdminPatch(8, patch, 8)).toThrow(
        "Недостаточно прав",
      );
    expect(() => resetAccountPassword(8, 8)).toThrow("Свой пароль");
    expect(row(8)).toEqual(senior);
    expect(row(7)).toEqual(owner);
  });

  it.each(["disabled", "passwordResetRequired"])(
    "старший с флагом %s не выдаёт временный пароль",
    (flag) => {
      applyAccountAdminPatch(8, { seniorAdmin: true }, 7);
      connection.prepare(`UPDATE accounts SET ${flag}=1 WHERE id=8`).run();
      const owner = row(7);
      expect(() => resetAccountPassword(7, 8)).toThrow("Недостаточно прав");
      expect(row(7)).toEqual(owner);
    },
  );

  it("обычный администратор даже со всеми правами не получает восстановление главного", () => {
    connection
      .prepare("UPDATE accounts SET permissions=? WHERE id=8")
      .run(
        JSON.stringify([
          "levels:write",
          "players:write",
          "districts:write",
          "records:write",
          "news:write",
          "history:write",
          "sync:run",
        ]),
      );
    const owner = row(7);
    expect(() => resetAccountPassword(7, 8)).toThrow("Недостаточно прав");
    expect(() => applyAccountAdminPatch(8, { seniorAdmin: true }, 8)).toThrow(
      "Недостаточно прав",
    );
    expect(row(7)).toEqual(owner);
  });

  it("главный с временным паролем не меняет роли через сервис", () => {
    connection
      .prepare("UPDATE accounts SET passwordResetRequired=1 WHERE id=7")
      .run();
    const target = row(8);
    expect(() => applyAccountAdminPatch(8, { seniorAdmin: true }, 7)).toThrow(
      "Недостаточно прав",
    );
    expect(row(8)).toEqual(target);
  });

  it("защита логов принимает только текущую роль главного или старшего и отвергает заблокированные и временные сессии", async () => {
    vi.stubGlobal("createError", createError);
    let id = 7;
    vi.stubGlobal("getUserSession", async () => ({
      user: { id },
      secure: { accountKey: row(id).sessionKey },
    }));
    expect((await requireSeniorAdmin({} as any)).id).toBe(7);
    id = 8;
    await expect(requireSeniorAdmin({} as any)).rejects.toThrow(
      "главного и старшего",
    );
    applyAccountAdminPatch(8, { seniorAdmin: true }, 7);
    expect((await requireSeniorAdmin({} as any)).id).toBe(8);
    applyAccountAdminPatch(8, { seniorAdmin: false }, 7);
    await expect(requireSeniorAdmin({} as any)).rejects.toThrow(
      "главного и старшего",
    );
    applyAccountAdminPatch(8, { seniorAdmin: true }, 7);
    connection
      .prepare("UPDATE accounts SET passwordResetRequired=1 WHERE id=8")
      .run();
    await expect(requireSeniorAdmin({} as any)).rejects.toThrow(
      "временный пароль",
    );
    connection
      .prepare(
        "UPDATE accounts SET passwordResetRequired=0,disabled=1 WHERE id=8",
      )
      .run();
    await expect(requireSeniorAdmin({} as any)).rejects.toThrow("Войдите");
    vi.stubGlobal("getUserSession", async () => ({}));
    await expect(requireSeniorAdmin({} as any)).rejects.toThrow("Войдите");
  });

  it("API восстановления проверяет старшую роль до чтения тела и ограничителя запросов", async () => {
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    const denied = vi.fn().mockRejectedValue(new Error("Нет старшей роли")),
      read = vi.fn(),
      throttle = vi.fn();
    vi.stubGlobal("requireSeniorAdmin", denied);
    vi.stubGlobal("readValidatedBody", read);
    vi.stubGlobal("throttle", throttle);
    const handler = (await import("../server/api/admin/account-password.post"))
      .default;
    await expect(handler({} as any)).rejects.toThrow("Нет старшей роли");
    expect(read).not.toHaveBeenCalled();
    expect(throttle).not.toHaveBeenCalled();
  });
});
