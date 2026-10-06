import { z } from "zod";
import { lookupVideoDate } from "../../services/video-date";
import { webUrl } from "../../services/media";

export default defineEventHandler(async (event) => {
  const user = await requireAccount(event);
  if (
    !user.headAdmin &&
    !user.permissions.some(
      (permission) =>
        permission === "records:write" || permission === "districts:write",
    )
  )
    throw createError({
      statusCode: 403,
      message: "Недостаточно прав для работы с датами прохождений",
    });
  throttle(event, "video-date", 60, 10);
  const parsed = z
    .object({ url: z.union([z.literal(""), webUrl]) })
    .safeParse(await readBody(event));
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      message: "Некорректная ссылка на видео",
    });
  return lookupVideoDate(parsed.data.url);
});
