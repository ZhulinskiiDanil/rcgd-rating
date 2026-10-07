import { randomBytes } from "node:crypto";
import { createError } from "h3";
import { account, db } from "../database";
import { hashSecret } from "./password";
import { logChange } from "./changes";

export function resetAccountPassword(id: number, actorId: number) {
  return db().transaction(() => {
    const actor = account(actorId);
    if (!actor?.headAdmin || actor.disabled || actor.passwordResetRequired)
      throw createError({ statusCode: 403, message: "Недостаточно прав" });
    if (id === actorId)
      throw createError({
        statusCode: 400,
        message: "Свой пароль можно изменить в настройках профиля",
      });
    const target = account(id);
    if (!target)
      throw createError({ statusCode: 404, message: "Аккаунт не найден" });
    const password = randomBytes(18).toString("base64url");
    db()
      .prepare(
        "UPDATE accounts SET passwordHash=?,sessionKey=?,passwordResetRequired=1 WHERE id=?",
      )
      .run(hashSecret(password), randomBytes(32).toString("hex"), id);
    logChange(
      "password-recovery",
      id,
      "Главный администратор выдал временный пароль",
      null,
      { accountId: id },
      actorId,
      false,
    );
    return { login: target.login, password };
  })();
}
