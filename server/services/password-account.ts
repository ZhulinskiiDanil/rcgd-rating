import { randomBytes } from "node:crypto";
import { createError } from "h3";
import { account, db, one } from "../database";
import { hashSecret, verifySecret } from "./password";
import { logChange } from "./changes";

const dummyHash = hashSecret("constant-time-placeholder-for-missing-account");

export function authenticatePassword(login: string, password: string) {
  const identity = one<{ id: number }>(
    "SELECT id FROM accounts WHERE login=?",
    login,
  );
  const user = identity ? account(identity.id) : undefined;
  const valid = verifySecret(user?.passwordHash || dummyHash, password);
  if (!valid || !user || user.disabled || !user.passwordHash)
    throw createError({
      statusCode: 401,
      message: "Неверный логин или пароль",
    });
  return user;
}

export function accountDestination(id: number) {
  const player = one<{ id: number }>(
    "SELECT id FROM players WHERE accountId=? AND deletedAt IS NULL",
    id,
  );
  return player ? `/players/${player.id}` : "/account/settings";
}

export function isRecentOAuthProof(
  secure:
    | {
        authMethod?: string;
        reauthenticatedAt?: number;
      }
    | undefined,
  now = Date.now(),
) {
  const time = secure?.reauthenticatedAt;
  return !!(
    (secure?.authMethod === "discord" || secure?.authMethod === "google") &&
    typeof time === "number" &&
    time <= now &&
    now - time <= 10 * 60 * 1000
  );
}

export function changeOwnPassword(
  id: number,
  sessionKey: string,
  value: { password: string; currentPassword?: string; login?: string },
  hasRecoveryProof: boolean,
) {
  return db().transaction(() => {
    const user = account(id);
    if (!user || user.disabled || user.sessionKey !== sessionKey)
      throw createError({
        statusCode: 401,
        message: "Войдите в аккаунт заново",
      });
    if (
      !hasRecoveryProof &&
      (!user.passwordHash ||
        !value.currentPassword ||
        !verifySecret(user.passwordHash, value.currentPassword))
    )
      throw createError({
        statusCode: 403,
        message: user.passwordHash
          ? "Укажите действующий пароль"
          : "Подтвердите доступ через ранее привязанный сервис",
      });
    if (
      value.login &&
      one("SELECT id FROM accounts WHERE login=? AND id!=?", value.login, id)
    )
      throw createError({ statusCode: 409, message: "Этот логин уже занят" });
    const key = randomBytes(32).toString("hex");
    db()
      .prepare(
        "UPDATE accounts SET passwordHash=?,sessionKey=?,login=? WHERE id=?",
      )
      .run(hashSecret(value.password), key, value.login || user.login, id);
    logChange(
      "password",
      id,
      "Изменён пароль аккаунта",
      null,
      { accountId: id },
      id,
      false,
    );
    return key;
  })();
}
