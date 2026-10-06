import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { MEDIA_NAME, mediaDirectory } from "../../services/media";

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, "name") || "";
  if (!MEDIA_NAME.test(name)) throw createError({ statusCode: 404 });
  let body: Buffer;
  try {
    body = await readFile(join(mediaDirectory(), name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw createError({ statusCode: 404 });
    throw error;
  }
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  setResponseHeader(event, "Content-Type", types[extname(name)]!);
  setResponseHeader(
    event,
    "Cache-Control",
    "public, max-age=31536000, immutable",
  );
  return body;
});
