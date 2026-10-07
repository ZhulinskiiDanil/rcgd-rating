import type { H3Event } from "h3";
import type { Permission } from "../../shared/types/domain";
import { account, db, one } from "../database";
import { sessionMatchesAccount } from "../services/account-session";
export async function currentAccount(event: H3Event) {
  const session = await getUserSession(event);
  if (!session.user?.id) return null;
  const value = account(session.user.id);
  return sessionMatchesAccount(session, value) ? value! : null;
}
export async function requireAccount(
  event: H3Event,
  allowPasswordReset = false,
) {
  const user = await currentAccount(event);
  if (!user)
    throw createError({ statusCode: 401, message: "Войдите в аккаунт" });
  if (user.passwordResetRequired && !allowPasswordReset)
    throw createError({
      statusCode: 403,
      message: "Сначала замените временный пароль в настройках профиля",
    });
  return user;
}
export async function requirePermission(
  event: H3Event,
  permission: Permission | "head-admin",
) {
  const user = await requireAccount(event);
  if (
    !user.headAdmin &&
    (permission === "head-admin" || !user.permissions.includes(permission))
  )
    throw createError({ statusCode: 403, message: "Недостаточно прав" });
  return user;
}
export function throttle(
  event: H3Event,
  bucket: string,
  limit: number,
  minutes: number,
) {
  const now = Date.now();
  const key = `${bucket}:${getRequestIP(event, { xForwardedFor: process.env.TRUST_PROXY === "true" }) ?? "unknown"}`;
  db().prepare("DELETE FROM rateLimits WHERE expires < ?").run(now);
  const entry = one<{ count: number; expires: number }>(
    "SELECT count,expires FROM rateLimits WHERE key=?",
    key,
  );
  if (entry && entry.count >= limit)
    throw createError({
      statusCode: 429,
      message: "Слишком много попыток. Попробуйте позже.",
    });
  db()
    .prepare(
      "INSERT INTO rateLimits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
    )
    .run(key, now + minutes * 60000);
}
