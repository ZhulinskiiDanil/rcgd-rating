import { synchronizeVideoDates } from "../../services/record-dates";

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, "sync:run");
  throttle(event, "sync-video-dates", 6, 60);
  try {
    return await synchronizeVideoDates(user.id);
  } catch (error) {
    throw createError({
      statusCode: 502,
      message:
        error instanceof Error ? error.message : "Ошибка синхронизации дат",
    });
  }
});
