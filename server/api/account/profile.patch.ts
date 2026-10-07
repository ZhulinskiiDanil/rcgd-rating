import { z } from "zod";
import { db, one } from "../../database";
import { mutate, logChange } from "../../services/changes";

export default defineEventHandler(async (event) => {
  const parsed = z
    .object({ nickname: z.string().trim().min(1).max(64) })
    .safeParse(await readBody(event));
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      message: "Ник должен содержать от 1 до 64 символов",
    });
  const user = await requireAccount(event);
  const nickname = parsed.data.nickname;
  return mutate("Изменение ника", user.id, () => {
    const player = one<{ id: number }>(
      "SELECT id FROM players WHERE accountId=?",
      user.id,
    );
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
