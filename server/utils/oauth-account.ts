import type { H3Event } from "h3";
import { db, one, account } from "../database";
export async function finishOAuth(
  event: H3Event,
  provider: "google" | "discord",
  subject: string,
  avatar: string | null,
) {
  const session = await getUserSession(event);
  const linkId = session.secure?.linkAccountId;
  const identity = one<{ accountId: number }>(
    "SELECT accountId FROM identities WHERE provider=? AND subject=?",
    provider,
    subject,
  );
  if (linkId && (!session.user || linkId !== session.user.id))
    throw createError({ statusCode: 403, message: "Сессия привязки истекла" });
  if (linkId && identity && identity.accountId !== linkId)
    throw createError({
      statusCode: 409,
      message: "Этот профиль уже связан с другим аккаунтом",
    });
  let id = identity?.accountId ?? linkId;
  if (id && account(id)?.disabled)
    throw createError({ statusCode: 403, message: "Аккаунт отключён" });
  db().transaction(() => {
    if (!id) {
      let login = `${provider}_${subject}`.slice(0, 60);
      if (one("SELECT id FROM accounts WHERE login=?", login))
        login += "_" + crypto.randomUUID().slice(0, 8);
      id = Number(
        db().prepare("INSERT INTO accounts(login) VALUES (?)").run(login)
          .lastInsertRowid,
      );
    }
    const other = one<{ subject: string }>(
      "SELECT subject FROM identities WHERE accountId=? AND provider=?",
      id,
      provider,
    );
    if (other && other.subject !== subject)
      throw createError({
        statusCode: 409,
        message: "Другой профиль этого сервиса уже привязан",
      });
    db()
      .prepare(
        "INSERT OR IGNORE INTO identities(provider,subject,accountId) VALUES (?,?,?)",
      )
      .run(provider, subject, id);
    const column = provider === "discord" ? "discordAvatar" : "googleAvatar";
    db().prepare(`UPDATE accounts SET ${column}=? WHERE id=?`).run(avatar, id);
  })();
  await replaceUserSession(event, { user: { id: id! } });
  return sendRedirect(event, "/account");
}
