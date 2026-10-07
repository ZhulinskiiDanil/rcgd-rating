import { z } from "zod";
import { db, one } from "../../database";
import { mutate, logChange } from "../../services/changes";
const permissions = {
  players: "players:write",
  levels: "levels:write",
  records: "records:write",
  extras: "districts:write",
} as const;
export default defineEventHandler(async (event) => {
  const parsed = z
    .object({
      resource: z.enum(["players", "levels", "records", "extras"]),
      id: z.number().int().positive(),
    })
    .safeParse(await readBody(event));
  if (!parsed.success)
    throw createError({ statusCode: 400, message: "Некорректный запрос" });
  const { resource, id } = parsed.data;
  const actor = await requirePermission(event, permissions[resource]);
  const table = resource === "extras" ? "districtExtras" : resource;
  if (!one(`SELECT id FROM ${table} WHERE id=?`, id))
    throw createError({ statusCode: 404 });
  mutate("Восстановление записи", actor.id, () => {
    db()
      .prepare(
        `UPDATE ${table} SET deletedAt=NULL${resource === "levels" ? ",listExcluded=0" : resource === "records" ? ",active=1" : ""} WHERE id=?`,
      )
      .run(id);
    logChange(
      "restore",
      id,
      "Запись восстановлена",
      null,
      { resource, id },
      actor.id,
      false,
    );
  });
  return { ok: true };
});
