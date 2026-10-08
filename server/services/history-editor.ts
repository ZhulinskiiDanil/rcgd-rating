import { createError } from "h3";
import { z } from "zod";
import { db, one } from "../database";
import { logChange } from "./changes";
import { formatHistoryText, withoutHistoryQuotes } from "./list-events";
import { formatDistrictHistory } from "./district-history";

const version = z.object({ updatedAt: z.iso.datetime().nullable() });
const position = z.number().int().min(1).max(150).nullable();
const tier = z.enum(["main", "extended", "legacy"]).nullable();
const schemas = {
  changes: version
    .extend({
      title: z.string().trim().min(1).max(6000),
      createdAt: z.iso.datetime(),
    })
    .strict(),
  levels: version
    .extend({
      fromRank: position,
      toRank: position,
      fromTier: tier,
      toTier: tier,
      note: z.string().trim().max(2000),
      createdAt: z.iso.datetime(),
    })
    .strict()
    .superRefine((row, context) => {
      for (const side of ["from", "to"] as const) {
        const rank = row[`${side}Rank`],
          list = row[`${side}Tier`];
        const valid =
          list === "main"
            ? rank !== null && rank <= 75
            : list === "extended"
              ? rank !== null && rank >= 76
              : rank === null;
        if (!valid)
          context.addIssue({
            code: "custom",
            path: [`${side}Rank`],
            message: "Позиция не соответствует разделу листа",
          });
      }
    }),
  ratings: version
    .extend({
      fromRank: z.number().int().positive().nullable(),
      toRank: z.number().int().positive().nullable(),
      note: z.string().trim().max(2000),
      createdAt: z.iso.datetime(),
    })
    .strict(),
};
export type HistoryTarget = keyof typeof schemas;

export function historyTarget(
  type: unknown,
  value: unknown,
): { type: HistoryTarget; id: number } {
  const id = Number(value);
  if (
    (type !== "changes" && type !== "levels" && type !== "ratings") ||
    !Number.isSafeInteger(id) ||
    id < 1
  )
    throw createError({
      statusCode: 400,
      message: "Некорректное событие истории",
    });
  return { type, id };
}

export function editHistory(
  type: HistoryTarget,
  id: number,
  input: unknown,
  actorId: number,
  remove = false,
) {
  const parsed = (remove ? version.strict() : schemas[type]).safeParse(input);
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      message: parsed.error.issues[0]?.message || "Некорректные данные события",
    });
  const table =
    type === "changes"
      ? "changes"
      : type === "levels"
        ? "levelHistory"
        : "ratingHistory";
  return db().transaction(() => {
    const row = one<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE id=? AND deletedAt IS NULL${type === "changes" ? " AND public=1 AND kind IN ('level','player-rating','district-rating')" : ""}`,
      id,
    );
    if (!row)
      throw createError({ statusCode: 404, message: "Событие не найдено" });
    if (row.updatedAt !== parsed.data.updatedAt)
      throw createError({
        statusCode: 409,
        message: "Событие уже изменено. Обновите историю и повторите правку.",
      });
    const previousTime = row.updatedAt ? Date.parse(String(row.updatedAt)) : 0;
    const updatedAt = new Date(
      Math.max(Date.now(), previousTime + 1),
    ).toISOString();
    const changes: Record<string, unknown> = remove
      ? { deletedAt: updatedAt, updatedAt }
      : { ...parsed.data, updatedAt };
    if (!remove) {
      if (typeof changes.title === "string")
        changes.title = normalizedTitle(String(row.kind), changes.title);
      if (changes.title === "")
        throw createError({
          statusCode: 400,
          message: "Введите текст события",
        });
      if (typeof changes.note === "string") {
        changes.note = withoutHistoryQuotes(changes.note);
        if (type === "levels") changes.noteEdited = 1;
      }
      if (type === "ratings") {
        changes.rank = changes.toRank;
        delete changes.toRank;
      }
    }
    const keys = Object.keys(changes);
    db()
      .prepare(
        `UPDATE ${table} SET ${keys.map((key) => `${key}=?`).join(",")} WHERE id=?`,
      )
      .run(...keys.map((key) => changes[key]), id);
    const removedLevelEvents =
      remove && type === "changes"
        ? db().prepare("DELETE FROM levelHistory WHERE changeId=?").run(id)
            .changes
        : 0;
    const removedRatingEvents =
      remove && type === "changes"
        ? db()
            .prepare(
              "DELETE FROM ratingHistory WHERE changeId=? OR id IN (SELECT historyId FROM ratingHistoryCauses WHERE changeId=?)",
            )
            .run(id, id).changes
        : 0;
    logChange(
      remove ? "history-delete" : "history-edit",
      id,
      `${remove ? "Удалено" : "Изменено"} событие ${type === "changes" ? "общей истории" : type === "levels" ? "истории уровня" : "истории рейтинга"}`,
      { type, event: row },
      {
        type,
        event: { ...row, ...changes },
        ...(remove && type === "changes"
          ? { removedLevelEvents, removedRatingEvents }
          : {}),
      },
      actorId,
      false,
    );
    return { ok: true, updatedAt };
  })();
}

function normalizedTitle(kind: string, title: string) {
  const names = db()
    .prepare(
      "SELECT name FROM levels UNION SELECT name FROM players UNION SELECT name FROM districts",
    )
    .all() as { name: string }[];
  if (kind === "district-rating") {
    const districts = db().prepare("SELECT name FROM districts").all() as {
      name: string;
    }[];
    title = formatDistrictHistory(
      withoutHistoryQuotes(title),
      districts.map((row) => row.name),
    );
  }
  return formatHistoryText(
    title,
    names.map((row) => row.name),
  );
}

export function deleteHistoryBatch(input: unknown, actorId: number) {
  const parsed = z
    .object({
      events: z
        .array(version.extend({ id: z.number().int().positive() }).strict())
        .min(1)
        .max(100),
    })
    .strict()
    .safeParse(input);
  if (
    !parsed.success ||
    new Set(parsed.data.events.map((event) => event.id)).size !==
      parsed.data.events.length
  )
    throw createError({
      statusCode: 400,
      message: "Выберите от 1 до 100 разных событий",
    });
  return db().transaction(() => {
    for (const event of parsed.data.events)
      editHistory(
        "changes",
        event.id,
        { updatedAt: event.updatedAt },
        actorId,
        true,
      );
    return { ok: true, removed: parsed.data.events.length };
  })();
}

export function createHistoryEvent(input: unknown, actorId: number) {
  const parsed = z
    .object({
      kind: z.enum(["level", "player-rating", "district-rating"]),
      entityId: z.number().int().positive().nullable(),
      title: z.string().trim().min(1).max(6000),
      createdAt: z.iso.datetime(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      message: "Проверьте тип, текст и дату события",
    });
  return db().transaction(() => {
    const { kind, entityId, createdAt } = parsed.data;
    const table =
      kind === "level"
        ? "levels"
        : kind === "player-rating"
          ? "players"
          : "districts";
    if (
      entityId !== null &&
      !db()
        .prepare(
          `SELECT id FROM ${table} WHERE id=?${table === "districts" ? "" : " AND deletedAt IS NULL"}`,
        )
        .get(entityId)
    )
      throw createError({
        statusCode: 404,
        message: "Выбранный уровень, игрок или район не найден",
      });
    const title = normalizedTitle(kind, parsed.data.title);
    if (!title)
      throw createError({ statusCode: 400, message: "Введите текст события" });
    const id = logChange(
      kind,
      entityId,
      title,
      null,
      { manual: true },
      actorId,
    );
    db()
      .prepare("UPDATE changes SET createdAt=? WHERE id=?")
      .run(createdAt, id);
    logChange(
      "history-create",
      id,
      "Добавлено событие общей истории",
      null,
      { id, kind, entityId, title, createdAt },
      actorId,
      false,
    );
    return { ok: true, id };
  })();
}
