import { db, one } from "../../../database";
import { mutate, logChange } from "../../../services/changes";
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "players:write");
  const id = Number(getRouterParam(event, "id"));
  if (!one("SELECT id FROM players WHERE id=? AND deletedAt IS NULL", id))
    throw createError({ statusCode: 404, message: "Игрок не найден" });
  mutate("Игрок удалён", actor.id, () => {
    db()
      .prepare("UPDATE players SET deletedAt=? WHERE id=?")
      .run(new Date().toISOString(), id);
    logChange("player-delete", id, "Игрок удалён", null, null, actor.id, false);
  });
  return { ok: true };
});
