import { db, one } from "../../../database";
import { mutate, logChange } from "../../../services/changes";
import { deleteRecordPermanently } from "../../../database/record-controls";

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, "records:write");
  const id = Number(getRouterParam(event, "id"));
  const permanent = getQuery(event).permanent === "true";
  const record = one<{ playerId: number; levelId: number }>(
    `SELECT playerId,levelId FROM records WHERE id=?${permanent ? "" : " AND deletedAt IS NULL"}`,
    id,
  );
  if (!record)
    throw createError({ statusCode: 404, message: "Рекорд не найден" });
  mutate("Рекорд удалён", user.id, () => {
    if (permanent) deleteRecordPermanently(db(), id);
    else
      db()
        .prepare(
          "UPDATE records SET active=0,deletedAt=?,updatedAt=? WHERE id=?",
        )
        .run(new Date().toISOString(), new Date().toISOString(), id);
    logChange(
      "record-delete",
      id,
      permanent ? "Рекорд удалён безвозвратно" : "Рекорд удалён",
      record,
      null,
      user.id,
      false,
    );
  });
  return { ok: true };
});
