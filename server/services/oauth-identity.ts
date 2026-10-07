import { createError } from "h3";
import { account, db, one } from "../database";

export function resolveOAuthIdentity(
  provider: "discord" | "google",
  subject: string,
  avatar: string | null,
) {
  const identity = one<{ accountId: number }>(
    "SELECT accountId FROM identities WHERE provider=? AND subject=?",
    provider,
    subject,
  );
  const user = identity ? account(identity.accountId) : undefined;
  if (!user || user.disabled)
    throw createError({
      statusCode: 403,
      message:
        "Этот профиль не связан с доступным аккаунтом. Используйте логин и пароль.",
    });
  const column = provider === "discord" ? "discordAvatar" : "googleAvatar";
  db()
    .prepare(`UPDATE accounts SET ${column}=? WHERE id=?`)
    .run(avatar, user.id);
  return user.id;
}
