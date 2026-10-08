import { synchronizeVideoDates } from "../../services/record-dates";
import { logChange } from "../../services/changes";

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, "sync:run");
  throttle(event, "sync-video-dates", 6, 60);
  logChange(
    "sync",
    null,
    "Запущена синхронизация дат видео",
    null,
    null,
    user.id,
    false,
  );
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
