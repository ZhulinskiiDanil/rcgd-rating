import { readImageBody, saveImage } from "../../services/media";
import { logChange } from "../../services/changes";

export default defineEventHandler(async (event) => {
  const user = await requireAccount(event);
  if (
    !user.headAdmin &&
    !user.permissions.some(
      (permission) =>
        permission === "levels:write" || permission === "players:write",
    )
  )
    throw createError({
      statusCode: 403,
      message: "Недостаточно прав для загрузки изображений",
    });
  const body = await readImageBody(event.node.req);
  const url = await saveImage(body, getRequestHeader(event, "content-type"));
  logChange(
    "media-upload",
    null,
    "Загружено изображение",
    null,
    { url },
    user.id,
    false,
  );
  return { url };
});
