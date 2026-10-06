import { synchronize } from "../../services/sync";
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, "sync:run");
  throttle(event, "sync", 6, 60);
  try {
    return await synchronize(user.id);
  } catch (e) {
    throw createError({
      statusCode: 502,
      message: e instanceof Error ? e.message : "Ошибка синхронизации",
    });
  }
});
