import { z } from "zod";
import { db, one } from "../../database";
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
      password: z.string().min(12).max(128),
    }).parse,
  );
  if (one("SELECT id FROM accounts WHERE login=?", body.login))
    throw createError({ statusCode: 409, message: "Логин уже занят" });
  const id = Number(
    db()
      .prepare("INSERT INTO accounts(login,passwordHash) VALUES (?,?)")
      .run(body.login, hashSecret(body.password)).lastInsertRowid,
  );
  await replaceUserSession(event, { user: { id } });
  return { ok: true };
});
