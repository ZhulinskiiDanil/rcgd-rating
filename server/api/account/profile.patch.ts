import { z } from "zod";
import { all, db, one } from "../../database";
import { mutate, logChange } from "../../services/changes";
import { normalizedName } from "../../../shared/utils/rating";

export default defineEventHandler(async (event) => {
  const user = await requireAccount(event);
  const parsed = z
    .object({ nickname: z.string().trim().min(1).max(64) })
    .safeParse(await readBody(event));
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      message: "Ник должен содержать от 1 до 64 символов",
    });
  const nickname = parsed.data.nickname;
  return mutate("Изменение ника", user.id, () => {
    const player = one<{ id: number }>(
      "SELECT id FROM players WHERE accountId=?",
      user.id,
    );
    const taken =
      all<{ id: number; nickname: string; login: string }>(
        "SELECT id,nickname,login FROM accounts WHERE id!=?",
        user.id,
      ).some(
        (account) =>
          normalizedName(account.nickname || account.login) ===
          normalizedName(nickname),
      ) ||
      all<{ id: number; name: string }>("SELECT id,name FROM players").some(
        (entry) =>
          entry.id !== player?.id &&
          normalizedName(entry.name) === normalizedName(nickname),
      );
    if (taken)
      throw createError({ statusCode: 409, message: "Этот ник уже занят" });
    db()
      .prepare("UPDATE accounts SET nickname=? WHERE id=?")
      .run(nickname, user.id);
    if (player)
      db()
        .prepare("UPDATE players SET name=? WHERE id=?")
        .run(nickname, player.id);
    logChange(
      "nickname",
      player?.id ?? user.id,
      "Изменён ник профиля",
      null,
      { nickname },
      user.id,
      false,
    );
    return { nickname };
  });
});
