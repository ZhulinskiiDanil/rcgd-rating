import { z } from "zod";
import { db, one } from "../../database";
import { mutate, logChange } from "../../services/changes";
import { imageUrl, webUrl } from "../../services/media";
import {
  resolveAutomaticDate,
  type RecordDateFields,
} from "../../services/video-date";
import {
  type Permission,
  type Player,
  type RecordEntry,
} from "../../../shared/types/domain";
import { preserveImportedRecordsOnRebind } from "../../services/sync";
import {
  accountAdminPatchSchema,
  applyAccountAdminPatch,
} from "../../services/account-admin";
import {
  recordEditFields,
  recordEditIsCurrent,
  movedRecordTombstone,
} from "../../services/record-edit";
const id = z.number().int().positive();
const optionalId = id.nullable().default(null);
const text = z.string().trim().max(2000);
const url = z.union([z.literal(""), webUrl]);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Некорректная дата")
  .nullable();
const percent = z.number().min(1).max(100).nullable().default(null);
const schemas = {
  players: z.object({
    id: id.optional(),
    name: text.min(1).max(64),
    districtId: optionalId,
    gdlId: optionalId,
    bio: text.default(""),
    accountId: optionalId,
    avatarUrl: imageUrl.optional(),
    inactive: z.boolean().optional(),
    hidden: z.boolean().optional(),
  }),
  levels: z.object({
    id: id.optional(),
    name: text.min(1).max(100),
    verifiedLocal: z.boolean(),
    thresholdName: text.nullable().default(null),
    gdlId: optionalId.optional(),
    globalRank: id.nullable().optional(),
    listPercent: z.number().min(0.01).max(100).nullable().optional(),
    endPercent: z.number().min(0.01).max(100).nullable().optional(),
    thresholdSource: z.enum(["manual", "coreboard"]).nullable().optional(),
    creator: text.default(""),
    video: url.optional(),
    previewImage: imageUrl.optional(),
    showcaseVideo: url.optional(),
    verificationPlayerId: id.nullable().optional(),
    verificationRegion: z.enum(["spb", "lo"]).nullable().optional(),
    verificationDate: date.optional(),
    exitedAt: date.optional(),
    listExcluded: z.boolean().optional(),
    manualPosition: z.number().int().min(1).max(150).nullable().optional(),
    ingameId: optionalId.optional(),
    length: z.number().int().min(1).max(86400).nullable().optional(),
    gameVersion: z.string().trim().max(32).optional(),
  }),
  districts: z.object({
    id: id.optional(),
    name: text.min(1).max(100),
    region: z.enum(["spb", "lo"]),
  }),
  records: z.object({
    id: id.optional(),
    playerId: id,
    levelId: id,
    manualPercent: percent,
    manualVideo: url.default(""),
    active: z.boolean(),
    isFirstRk: z.boolean().optional(),
    isFirstSpb: z.boolean().optional(),
    isFirstLo: z.boolean().optional(),
    achievedAt: date.optional(),
    dateSource: z.enum(["manual", "video"]).nullable().optional(),
    sourceVideo: z.string().max(2048).optional(),
    reviewNeeded: z.boolean().default(false),
    discardImported: z.boolean().default(false),
  }),
  extras: z.object({
    id: id.optional(),
    districtId: id,
    levelId: id,
    note: text.default(""),
    achievedAt: date.default(null),
  }),
  accounts: accountAdminPatchSchema.extend({ id }),
  news: z.object({ id: id.optional(), title: text.min(1).max(2000) }),
};
const permission: Record<keyof typeof schemas, Permission | "head-admin"> = {
  players: "players:write",
  levels: "levels:write",
  districts: "districts:write",
  records: "records:write",
  extras: "districts:write",
  accounts: "head-admin",
  news: "news:write",
};
export default defineEventHandler(async (event) => {
  const resource = (getRouterParam(event, "resource") ??
    getRequestURL(event).pathname.split("/").at(-1)) as keyof typeof schemas;
  if (!Object.hasOwn(schemas, resource)) throw createError({ statusCode: 404 });
  const user = await requirePermission(event, permission[resource]);
  const body = await readBody(event);
  const parsed = schemas[resource].safeParse(body);
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      message: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  const value = parsed.data;
  const table =
    resource === "extras"
      ? "districtExtras"
      : resource === "news"
        ? "changes"
        : resource;
  const before = value.id
    ? one<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE id=?`,
        value.id,
      )
    : null;
  if (value.id && !before)
    throw createError({ statusCode: 404, message: "Запись не найдена" });
  const previousRecord =
    resource === "records" && before
      ? (before as unknown as RecordEntry)
      : null;
  let preparedRecord: ReturnType<typeof recordEditFields> | undefined;
  if (resource === "records") {
    const record = schemas.records.parse(value);
    if (before?.deletedAt)
      throw createError({ statusCode: 409, message: "Рекорд удалён" });
    if (
      one(
        "SELECT id FROM records WHERE playerId=? AND levelId=? AND deletedAt IS NOT NULL",
        record.playerId,
        record.levelId,
      )
    )
      throw createError({
        statusCode: 409,
        message: "Этот рекорд удалён и защищён от повторного импорта",
      });
    preparedRecord = recordEditFields(record, previousRecord);
    if (
      record.active &&
      !Math.max(
        preparedRecord.manualPercent ?? 0,
        preparedRecord.importedPercent ?? 0,
      )
    )
      throw createError({
        statusCode: 400,
        message: "Для активного рекорда нужен ручной или глобальный результат",
      });
  }
  let recordDates: RecordDateFields | undefined;
  if (resource === "records") {
    const record = schemas.records.parse(value);
    const manual =
      record.dateSource === "manual" ||
      (record.dateSource === undefined &&
        (before?.dateSource === "manual" || !!record.achievedAt));
    if (manual)
      recordDates = {
        achievedAt:
          record.achievedAt === undefined
            ? ((before?.achievedAt as string | null) ?? null)
            : record.achievedAt,
        dateSource: "manual",
        sourceVideo: "",
      };
    else
      recordDates = await resolveAutomaticDate({
        ...preparedRecord!,
        achievedAt: (before?.achievedAt as string | null) ?? null,
        dateSource: before?.dateSource === "video" ? "video" : null,
        sourceVideo: (before?.sourceVideo as string) ?? "",
      });
  }
  try {
    return mutate("Изменение администрацией", user.id, () => {
      if (
        previousRecord &&
        !recordEditIsCurrent(
          previousRecord,
          one<RecordEntry>(
            "SELECT * FROM records WHERE id=?",
            previousRecord.id,
          ),
        )
      )
        throw createError({
          statusCode: 409,
          message:
            "Рекорд изменён или удалён во время сохранения. Обновите страницу и повторите правку.",
        });
      if (resource === "accounts") {
        const a = schemas.accounts.parse(value);
        return applyAccountAdminPatch(a.id, a, user.id);
      }
      if (resource === "levels") {
        const level = schemas.levels.parse(value);
        if (level.exitedAt != null && before?.status !== "legacy")
          throw createError({
            statusCode: 400,
            message:
              "Дату вылета можно указать только для уровня в Legacy List",
          });
        const verifier =
          level.verificationPlayerId === undefined
            ? before?.verificationPlayerId
            : level.verificationPlayerId;
        const region =
          level.verificationRegion === undefined
            ? before?.verificationRegion
            : level.verificationRegion;
        if (
          verifier &&
          (!region ||
            !one("SELECT id FROM players WHERE id=?", Number(verifier)))
        )
          throw createError({
            statusCode: 400,
            message: "Для верификации выберите существующего игрока и регион",
          });
      }
      if (resource === "players") {
        const p = schemas.players.parse(value);
        if (p.id && before?.gdlId !== p.gdlId)
          preserveImportedRecordsOnRebind(
            p.id,
            (before?.gdlId as number | null) ?? null,
          );
      }
      const fields: Record<string, unknown> = { ...value };
      delete fields.id;
      if (resource === "levels") {
        const level = schemas.levels.parse(value);
        const t =
          level.listPercent === undefined
            ? before?.listPercent
            : level.listPercent;
        const T =
          level.endPercent === undefined
            ? before?.endPercent
            : level.endPercent;
        if (
          (t == null) !== (T == null) ||
          (t != null && Number(t) >= Number(T))
        )
          throw createError({
            statusCode: 400,
            message: "Укажите оба порога: 0 < t < T ≤ 100",
          });
        if (
          (level.listPercent !== undefined &&
            level.listPercent !== before?.listPercent) ||
          (level.endPercent !== undefined &&
            level.endPercent !== before?.endPercent)
        )
          fields.thresholdSource = "manual";
        if (level.thresholdSource === null) fields.thresholdSource = null;
      }
      if (resource === "records") {
        const record = schemas.records.parse(value);
        delete fields.discardImported;
        Object.assign(fields, preparedRecord, recordDates);
        const region = one<{ region: "spb" | "lo" | null }>(
          "SELECT d.region FROM players p LEFT JOIN districts d ON d.id=p.districtId WHERE p.id=? AND p.deletedAt IS NULL",
          record.playerId,
        )?.region;
        fields.isFirstSpb =
          region === "spb"
            ? Number(record.isFirstSpb ?? previousRecord?.isFirstSpb ?? 0)
            : 0;
        fields.isFirstLo =
          region === "lo"
            ? Number(record.isFirstLo ?? previousRecord?.isFirstLo ?? 0)
            : 0;
        if (
          (fields.isFirstSpb || fields.isFirstLo) &&
          Math.max(
            preparedRecord!.manualPercent ?? 0,
            preparedRecord!.importedPercent ?? 0,
          ) !== 100
        )
          throw createError({
            statusCode: 400,
            message:
              "Первым региональным виктором можно отметить только прохождение на 100%.",
          });
        fields.updatedAt = new Date().toISOString();
        if (record.discardImported && record.id) {
          logChange(
            "record-review",
            record.playerId,
            "Администрация убрала сохранённый глобальный результат",
            { percent: before?.importedPercent },
            { playerId: record.playerId, levelId: record.levelId },
            user.id,
          );
        }
      }
      if (resource === "levels" && before?.gdlId) {
        delete fields.name;
        delete fields.creator;
        delete fields.video;
        delete fields.ingameId;
      }
      if (resource === "news") {
        if (before && before.kind !== "news")
          throw createError({ statusCode: 400 });
        fields.kind = "news";
      }
      const names = Object.keys(fields),
        values = Object.values(fields).map((v) =>
          typeof v === "boolean" ? Number(v) : v,
        ) as (string | number | null)[];
      let savedId = value.id;
      if (savedId)
        db()
          .prepare(
            `UPDATE ${table} SET ${names.map((k) => `${k}=?`).join(",")} WHERE id=?`,
          )
          .run(...values, savedId);
      else
        savedId = Number(
          db()
            .prepare(
              `INSERT INTO ${table}(${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`,
            )
            .run(...values).lastInsertRowid,
        );
      if (previousRecord && resource === "records") {
        const record = schemas.records.parse(value);
        const tombstone = movedRecordTombstone(
          previousRecord,
          record.playerId,
          record.levelId,
          String(fields.updatedAt),
        );
        if (tombstone) {
          const columns = Object.keys(tombstone);
          db()
            .prepare(
              `INSERT INTO records(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            )
            .run(...Object.values(tombstone));
        }
      }
      if (resource === "levels" && fields.ingameId && !before?.gdlId) {
        const duplicate = one<{ id: number }>(
          "SELECT id FROM levels WHERE ingameId=? AND id!=?",
          Number(fields.ingameId),
          savedId!,
        );
        if (duplicate)
          throw createError({
            statusCode: 409,
            message:
              "Уровень с этим ID уже есть в каталоге. Добавьте существующий уровень в лист.",
          });
      }
      if (resource !== "news")
        logChange(
          "admin-edit",
          savedId,
          `${resource}: ${value.id ? "изменена" : "добавлена"} запись`,
          null,
          { resource, id: savedId },
          user.id,
          false,
        );
      if (
        resource === "players" &&
        "avatarUrl" in fields &&
        fields.avatarUrl !== (before?.avatarUrl ?? "")
      )
        logChange(
          "avatar",
          savedId,
          "Изменена аватарка игрока",
          { avatarUrl: before?.avatarUrl ?? "" },
          { avatarUrl: fields.avatarUrl },
          user.id,
          false,
        );
      if (resource === "records") {
        const p = one<Player>(
          "SELECT * FROM players WHERE id=?",
          body.playerId,
        );
        logChange(
          "record",
          body.playerId,
          `${p?.name}: ${body.manualPercent ? body.manualPercent + "%" : "обновление рекорда"}`,
          null,
          {
            playerId: body.playerId,
            levelId: body.levelId,
            active: body.active,
          },
          user.id,
        );
      }
      if (resource === "extras")
        logChange(
          "district-extra",
          body.districtId,
          "Добавлено или изменено отдельное достижение района",
          null,
          { districtId: body.districtId, levelId: body.levelId },
          user.id,
        );
      if (
        resource === "players" &&
        before &&
        before.districtId !== body.districtId
      )
        logChange(
          "player-district",
          savedId,
          `${body.name}: изменён район`,
          { districtId: before.districtId },
          { districtId: body.districtId },
          user.id,
        );
      return { id: savedId };
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint"))
      throw createError({
        statusCode: 409,
        message:
          "Такая запись или привязка уже существует. Отредактируйте существующую.",
      });
    if (
      error instanceof Error &&
      error.message.includes("FOREIGN KEY constraint")
    )
      throw createError({
        statusCode: 400,
        message: "Выбранная связанная запись не существует",
      });
    throw error;
  }
});
