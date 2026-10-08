import { randomBytes } from "node:crypto";
import { createError } from "h3";
import { z } from "zod";
import { account, db, one } from "../database";
import { PERMISSIONS } from "../../shared/types/domain";
import { imageUrl } from "./media";
import { logChange } from "./changes";

export const accountAdminPatchSchema = z.object({
  login: z.string().trim().min(1).max(64).optional(),
  nickname: z.string().trim().max(64).optional(),
  playerId: z.number().int().positive().nullable().optional(),
  avatarUrl: imageUrl.optional(),
  avatarLocked: z.boolean().optional(),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
  disabled: z.boolean().optional(),
  headAdmin: z.boolean().optional(),
  seniorAdmin: z.boolean().optional(),
  adminContact: z.string().trim().max(300).optional(),
  unlinkDiscord: z.boolean().optional(),
  transferHeadAdminTo: z.number().int().positive().nullable().optional(),
});

export function applyAccountAdminPatch(
  id: number,
  patch: z.infer<typeof accountAdminPatchSchema>,
  actorId: number,
) {
  const value = accountAdminPatchSchema.parse(patch);
  return db().transaction(() => {
    const actor = account(actorId);
    if (!actor?.headAdmin || actor.disabled || actor.passwordResetRequired)
      throw createError({ statusCode: 403, message: "Недостаточно прав" });
    const before = account(id);
    if (!before)
      throw createError({ statusCode: 404, message: "Аккаунт не найден" });
    const { unlinkDiscord, transferHeadAdminTo, playerId, ...fields } = value;
    if (playerId != null) {
      const player = one<{ accountId: number | null }>(
        "SELECT accountId FROM players WHERE id=? AND deletedAt IS NULL",
        playerId,
      );
      if (!player)
        throw createError({
          statusCode: 404,
          message: "Профиль игрока не найден",
        });
      if (player.accountId !== null && player.accountId !== id)
        throw createError({
          statusCode: 409,
          message:
            "Этот профиль уже привязан к другому аккаунту. Сначала отвяжите его в настройках того аккаунта.",
        });
    }
    if (transferHeadAdminTo != null) {
      if (!before.headAdmin || transferHeadAdminTo === id)
        throw createError({
          statusCode: 400,
          message: "Выберите другой аккаунт для передачи прав",
        });
      const target = account(transferHeadAdminTo);
      if (
        !target ||
        target.disabled ||
        (!target.passwordHash &&
          !one("SELECT subject FROM identities WHERE accountId=?", target.id))
      )
        throw createError({
          statusCode: 400,
          message: "Получатель должен иметь доступный способ входа",
        });
      db().prepare("UPDATE accounts SET headAdmin=1 WHERE id=?").run(target.id);
      fields.headAdmin = false;
    }
    if (
      fields.headAdmin === true &&
      !before.headAdmin &&
      !before.passwordHash &&
      !one("SELECT subject FROM identities WHERE accountId=?", id)
    )
      throw createError({
        statusCode: 400,
        message:
          "Для назначения главным администратором нужен доступный способ входа",
      });
    if (
      fields.login !== undefined &&
      one("SELECT id FROM accounts WHERE login=? AND id!=?", fields.login, id)
    )
      throw createError({ statusCode: 409, message: "Этот логин уже занят" });
    const stored: Record<string, string | number | null> = {};
    for (const [name, field] of Object.entries(fields)) {
      if (field === undefined) continue;
      stored[name] = Array.isArray(field)
        ? JSON.stringify(field)
        : typeof field === "boolean"
          ? Number(field)
          : field;
    }
    if (unlinkDiscord) {
      db()
        .prepare(
          "DELETE FROM identities WHERE provider='discord' AND accountId=?",
        )
        .run(id);
      stored.discordAvatar = null;
    }
    if (unlinkDiscord || (fields.disabled && !before.disabled))
      stored.sessionKey = randomBytes(32).toString("hex");
    if (Object.keys(stored).length)
      db()
        .prepare(
          `UPDATE accounts SET ${Object.keys(stored)
            .map((key) => `${key}=?`)
            .join(",")} WHERE id=?`,
        )
        .run(...Object.values(stored), id);
    if (
      before.headAdmin &&
      (fields.headAdmin === false || fields.disabled || unlinkDiscord)
    ) {
      const remaining = one<{ count: number }>(
        "SELECT COUNT(*) AS count FROM accounts a WHERE a.headAdmin=1 AND a.disabled=0 AND (a.passwordHash IS NOT NULL OR EXISTS(SELECT 1 FROM identities i WHERE i.accountId=a.id))",
      )!.count;
      if (!remaining)
        throw createError({
          statusCode: 409,
          message:
            "Нельзя закрыть доступ последнему главному администратору. Сначала назначьте другого.",
        });
    }
    if (playerId !== undefined) {
      db()
        .prepare("UPDATE players SET accountId=NULL WHERE accountId=?")
        .run(id);
      if (playerId !== null)
        db()
          .prepare("UPDATE players SET accountId=? WHERE id=?")
          .run(id, playerId);
    }
    if (fields.nickname && fields.nickname !== before.nickname)
      db()
        .prepare("UPDATE players SET name=? WHERE accountId=?")
        .run(fields.nickname, id);
    logChange(
      "account",
      id,
      "Изменены настройки аккаунта",
      null,
      {
        id,
        fields: Object.keys(fields),
        ...(playerId !== undefined ? { playerId } : {}),
        unlinkDiscord: !!unlinkDiscord,
        transferHeadAdminTo: transferHeadAdminTo ?? null,
      },
      actorId,
      false,
    );
    return { id };
  })();
}
