import { db, one } from "../../../database";
import { mutate, logChange } from "../../../services/changes";

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, "levels:write");
  const id = Number(getRouterParam(event, "id"));
  const level = one<{ id: number; name: string }>(
    "SELECT id,name FROM levels WHERE id=?",
    id,
  );
  if (!level)
    throw createError({ statusCode: 404, message: "Уровень не найден" });
  mutate("Уровень исключён из листа", user.id, () => {
    db().prepare("UPDATE levels SET listExcluded=1 WHERE id=?").run(id);
    logChange(
      "level-exclusion",
      id,
      `${level.name}: исключён из листа`,
      null,
      { id },
      user.id,
      false,
    );
  });
  return { ok: true };
});
