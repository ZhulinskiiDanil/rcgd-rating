import { createError } from "h3";
import { z } from "zod";
import { db, one } from "../database";
import { logChange } from "./changes";
import { withoutHistoryQuotes } from "./list-events";

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
};
export type HistoryTarget = keyof typeof schemas;

export function historyTarget(
  type: unknown,
  value: unknown,
): { type: HistoryTarget; id: number } {
  const id = Number(value);
  if (
    (type !== "changes" && type !== "levels") ||
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
  const table = type === "changes" ? "changes" : "levelHistory";
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
        changes.title = withoutHistoryQuotes(changes.title);
      if (changes.title === "")
        throw createError({
          statusCode: 400,
          message: "Введите текст события",
        });
      if (typeof changes.note === "string") {
        changes.note = withoutHistoryQuotes(changes.note);
        changes.noteEdited = 1;
      }
    }
    const keys = Object.keys(changes);
    db()
      .prepare(
        `UPDATE ${table} SET ${keys.map((key) => `${key}=?`).join(",")} WHERE id=?`,
      )
      .run(...keys.map((key) => changes[key]), id);
    logChange(
      remove ? "history-delete" : "history-edit",
      id,
      `${remove ? "Удалено" : "Изменено"} событие ${type === "changes" ? "общей истории" : "истории уровня"}`,
      { type, event: row },
      { type, event: { ...row, ...changes } },
      actorId,
      false,
    );
    return { ok: true, updatedAt };
  })();
}
