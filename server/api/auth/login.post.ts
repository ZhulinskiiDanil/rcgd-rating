import { z } from "zod";
import { one } from "../../database";
import { verifySecret, hashSecret } from "../../services/password";
const dummyHash = hashSecret("constant-time-placeholder-for-missing-account");
export default defineEventHandler(async (event) => {
  throttle(event, "login", 15, 15);
  const body = await readValidatedBody(
    event,
    z.object({
      login: z.string().trim().min(1).max(64),
      password: z.string().min(1).max(128),
    }).parse,
  );
  const user = one<{
    id: number;
    passwordHash: string | null;
    disabled: number;
  }>("SELECT id,passwordHash,disabled FROM accounts WHERE login=?", body.login);
  const valid = verifySecret(user?.passwordHash || dummyHash, body.password);
  if (!valid || !user || user.disabled || !user.passwordHash)
    throw createError({
      statusCode: 401,
      message: "Неверный логин или пароль",
    });
  await replaceUserSession(event, { user: { id: user.id } });
  return { ok: true };
});
