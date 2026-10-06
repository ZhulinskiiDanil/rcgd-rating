import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Readable } from "node:stream";
import { migrateMedia } from "../server/database/migrations";
import {
  imageExtension,
  imageUrl,
  MAX_IMAGE_BYTES,
  readImageBody,
} from "../server/services/media";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMfkAAAAASUVORK5CYII=",
  "base64",
);

describe("Медиа и обновление существующей базы", () => {
  it("добавляет колонки в v1 без изменения аккаунтов, привязок и результатов; повторный запуск сохраняет правки", () => {
    const db = new Database(":memory:");
    try {
      db.exec(`
        PRAGMA foreign_keys=ON;
        CREATE TABLE accounts(id INTEGER PRIMARY KEY, login TEXT, passwordHash TEXT);
        CREATE TABLE players(id INTEGER PRIMARY KEY, name TEXT, accountId INTEGER REFERENCES accounts(id));
        CREATE TABLE levels(id INTEGER PRIMARY KEY, name TEXT, video TEXT);
        CREATE TABLE records(id INTEGER PRIMARY KEY, playerId INTEGER REFERENCES players(id), levelId INTEGER REFERENCES levels(id), manualPercent REAL);
        INSERT INTO accounts VALUES(1,'existing','stored-hash');
        INSERT INTO players VALUES(1,'Player',1);
        INSERT INTO levels VALUES(1,'Level','https://example.com/global');
        INSERT INTO records VALUES(1,1,1,100);
        PRAGMA user_version=1;
      `);
      migrateMedia(db);
      expect(
        db.prepare("SELECT login,passwordHash,avatarUrl FROM accounts").get(),
      ).toEqual({
        login: "existing",
        passwordHash: "stored-hash",
        avatarUrl: "",
      });
      expect(
        db.prepare("SELECT accountId,avatarUrl FROM players").get(),
      ).toEqual({ accountId: 1, avatarUrl: "" });
      expect(db.prepare("SELECT manualPercent FROM records").get()).toEqual({
        manualPercent: 100,
      });
      expect(
        db
          .prepare(
            "SELECT previewImage,showcaseVideo,verificationPlayerId,verificationRegion,verificationDate FROM levels",
          )
          .get(),
      ).toEqual({
        previewImage: "",
        showcaseVideo: "",
        verificationPlayerId: null,
        verificationRegion: null,
        verificationDate: null,
      });
      db.exec(
        "UPDATE levels SET previewImage='https://example.com/cover.png',verificationPlayerId=1,verificationRegion='lo'",
      );
      migrateMedia(db);
      expect(
        db
          .prepare(
            "SELECT previewImage,verificationPlayerId,verificationRegion FROM levels",
          )
          .get(),
      ).toEqual({
        previewImage: "https://example.com/cover.png",
        verificationPlayerId: 1,
        verificationRegion: "lo",
      });
      expect(db.pragma("user_version", { simple: true })).toBe(2);
    } finally {
      db.close();
    }
  });

  it("разрешает HTTP/HTTPS и только безопасные локальные пути загрузок", () => {
    for (const url of [
      "",
      "https://example.com/avatar.png",
      "http://localhost/cover.webp",
      "/media/a3c688ef-29bc-42b3-93dc-50728aa2eef9.jpg",
    ])
      expect(imageUrl.safeParse(url).success).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg>",
      "file:///private",
      "/media/../../.env",
      "/media/a3c688ef-29bc-42b3-93dc-50728aa2eef9.svg",
      "https://user:secret@example.com/avatar.png",
      "//example.com/a.png",
    ])
      expect(imageUrl.safeParse(url).success).toBe(false);
  });

  it("проверяет сигнатуру и соответствие Content-Type, не принимает SVG", () => {
    expect(imageExtension(png, "image/png")).toBe("png");
    expect(() => imageExtension(png, "image/jpeg")).toThrow();
    expect(() =>
      imageExtension(
        Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
        "image/png",
      ),
    ).toThrow();
    expect(() =>
      imageExtension(Buffer.from("<svg/>"), "image/svg+xml"),
    ).toThrow();
    expect(() => imageExtension(Buffer.alloc(0), "image/png")).toThrow();
  });

  it("ограничивает размер при чтении потока без Content-Length", async () => {
    await expect(
      readImageBody(
        Readable.from([Buffer.alloc(MAX_IMAGE_BYTES), Buffer.alloc(1)]),
      ),
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(
      await readImageBody(
        Readable.from([png.subarray(0, 12), png.subarray(12)]),
      ),
    ).toEqual(png);
  });
});
