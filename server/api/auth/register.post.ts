import { z } from "zod";
import { db, one, account } from "../../database";
import { hashSecret } from "../../services/password";

export default defineEventHandler(async (event) => {
  throttle(event, "register", 5, 60);
  const body = await readValidatedBody(
    event,
    z.object({
      login: z
        .string()
        .trim()
        .regex(/^[a-zA-Z0-9_.-]{3,32}$/),
      nickname: z.string().trim().min(1).max(64).optional(),
      password: z.string().min(12).max(128),
    }).parse,
  );
  const id = db().transaction(() => {
    if (one("SELECT id FROM accounts WHERE login=?", body.login))
      throw createError({ statusCode: 409, message: "Этот логин уже занят" });
    return Number(
      db()
        .prepare(
          "INSERT INTO accounts(login,nickname,passwordHash) VALUES (?,?,?)",
        )
        .run(body.login, body.nickname || body.login, hashSecret(body.password))
        .lastInsertRowid,
    );
  })();
  const user = account(id)!;
  await replaceUserSession(event, {
    user: { id },
    secure: {
      accountKey: user.sessionKey,
      authMethod: "password",
      reauthenticatedAt: Date.now(),
    },
  });
  return { ok: true, url: "/account/settings" };
});
