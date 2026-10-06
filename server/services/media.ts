import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { createError } from "h3";
import { z } from "zod";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MEDIA_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/;
export const webUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Нужна HTTP или HTTPS ссылка без логина и пароля");
export const imageUrl = z.union([
  z.literal(""),
  webUrl,
  z
    .string()
    .refine(
      (value) => value.startsWith("/media/") && MEDIA_NAME.test(value.slice(7)),
      "Некорректный путь к изображению",
    ),
]);

export function mediaDirectory() {
  return join(
    dirname(resolve(process.env.DATABASE_PATH || ".data/spb.sqlite")),
    "media",
  );
}

export async function readImageBody(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_IMAGE_BYTES) {
      stream.resume();
      throw createError({
        statusCode: 413,
        message: "Размер изображения не должен превышать 5 МБ",
      });
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export function imageExtension(
  body: Buffer,
  contentType: string | undefined,
): "png" | "jpg" | "webp" {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  const png =
    body.length >= 24 &&
    body
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    body.toString("ascii", 12, 16) === "IHDR";
  const jpeg =
    body.length >= 4 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff &&
    body[body.length - 2] === 0xff &&
    body[body.length - 1] === 0xd9;
  const webp =
    body.length >= 16 &&
    body.toString("ascii", 0, 4) === "RIFF" &&
    body.toString("ascii", 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(body.toString("ascii", 12, 16)) &&
    body.readUInt32LE(4) === body.length - 8;
  if (type === "image/png" && png) return "png";
  if (type === "image/jpeg" && jpeg) return "jpg";
  if (type === "image/webp" && webp) return "webp";
  throw createError({
    statusCode: 415,
    message:
      "Загрузите изображение PNG, JPEG или WebP соответствующего формата",
  });
}

export async function saveImage(body: Buffer, contentType: string | undefined) {
  if (body.length > MAX_IMAGE_BYTES)
    throw createError({
      statusCode: 413,
      message: "Размер изображения не должен превышать 5 МБ",
    });
  const extension = imageExtension(body, contentType);
  const name = `${randomUUID()}.${extension}`;
  await mkdir(mediaDirectory(), { recursive: true });
  await writeFile(join(mediaDirectory(), name), body, { flag: "wx" });
  return `/media/${name}`;
}
