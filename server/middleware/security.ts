import { isAllowedOrigin } from "../services/request-origin";
import { MAX_IMAGE_BYTES } from "../services/media";

export default defineEventHandler((event) => {
  setResponseHeader(event, "X-Content-Type-Options", "nosniff");
  setResponseHeader(
    event,
    "Referrer-Policy",
    "strict-origin-when-cross-origin",
  );
  setResponseHeader(event, "X-Frame-Options", "DENY");
  if (event.path.startsWith("/api/"))
    setResponseHeader(event, "Cache-Control", "no-store");
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(event.method)) return;
  const origin = getRequestHeader(event, "origin");
  const expected = process.env.APP_ORIGIN || getRequestURL(event).origin;
  if (!isAllowedOrigin(origin, expected))
    throw createError({
      statusCode: 403,
      message: "Недопустимый источник запроса",
    });
  const limit =
    event.method === "POST" && event.path.split("?")[0] === "/api/admin/media"
      ? MAX_IMAGE_BYTES
      : 65536;
  if (Number(getRequestHeader(event, "content-length") || 0) > limit)
    throw createError({ statusCode: 413, message: "Слишком большой запрос" });
});
