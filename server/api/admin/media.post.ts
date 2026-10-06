import { readImageBody, saveImage } from "../../services/media";

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
  return {
    url: await saveImage(body, getRequestHeader(event, "content-type")),
  };
});
