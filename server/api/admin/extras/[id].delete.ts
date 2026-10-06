import { db, one } from "../../../database";
import { mutate, logChange } from "../../../services/changes";
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, "districts:write");
  const id = Number(getRouterParam(event, "id"));
  const before = one<{ districtId: number; levelId: number }>(
    "SELECT districtId,levelId FROM districtExtras WHERE id=?",
    id,
  );
  if (!before) throw createError({ statusCode: 404 });
  mutate("Удалено отдельное достижение района", user.id, () => {
    db().prepare("DELETE FROM districtExtras WHERE id=?").run(id);
    logChange(
      "district-extra",
      before.districtId,
      "Удалено отдельное достижение района",
      before,
      null,
      user.id,
    );
  });
  return { ok: true };
});
