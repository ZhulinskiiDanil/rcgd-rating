import type Database from "better-sqlite3";
import { z } from "zod";
import { createError } from "h3";

const kinds = [
  "account",
  "password-recovery",
  "admin-edit",
  "record",
  "record-delete",
  "record-date",
  "player-delete",
  "player-district",
  "district-extra",
  "extra-delete",
  "level-exclusion",
  "history-create",
  "history-edit",
  "history-delete",
  "restore",
  "sync",
  "media-upload",
] as const;
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  actorId: z.coerce.number().int().positive().optional(),
  kind: z.enum(kinds).optional(),
  search: z.string().trim().max(200).default(""),
});
const fieldLabels: Record<string, string> = {
  login: "Логин",
  nickname: "Ник",
  name: "Название",
  playerId: "Профиль игрока",
  districtId: "Район",
  levelId: "Уровень",
  accountId: "Аккаунт",
  gdlId: "ID в глобале",
  avatarUrl: "Аватарка",
  avatarLocked: "Запрет смены аватарки",
  permissions: "Права",
  disabled: "Блокировка",
  headAdmin: "Главный администратор",
  seniorAdmin: "Старший администратор",
  adminContact: "Контакт",
  transferHeadAdminTo: "Передача управления",
  unlinkDiscord: "Привязка Discord",
  bio: "Описание",
  hidden: "Видимость в рейтинге",
  inactive: "Активность игрока",
  verifiedLocal: "Местная верификация",
  verificationPlayerId: "Верифер",
  verificationRegion: "Регион верификации",
  verificationDate: "Дата верификации",
  creator: "Автор",
  previewImage: "Превью",
  video: "Видео",
  showcaseVideo: "Видео-превью",
  globalRank: "Глобальная позиция",
  manualPosition: "Ручная позиция",
  listPercent: "Лист-процент",
  endPercent: "Эндинг-процент",
  thresholdName: "Прогресс",
  thresholdSource: "Источник процентов",
  exitedAt: "Дата вылета в Legacy",
  listExcluded: "Исключение из листа",
  ingameId: "ID уровня",
  length: "Длина",
  gameVersion: "Версия игры",
  region: "Регион",
  manualPercent: "Процент",
  manualVideo: "Видео рекорда",
  active: "Участие рекорда в рейтинге",
  isFirstRk: "Первый РК виктор",
  isFirstSpb: "Первый СПб виктор",
  isFirstLo: "Первый ЛО виктор",
  isVerifier: "Верифер",
  achievedAt: "Дата прохождения",
  dateSource: "Источник даты",
  title: "Текст события",
  note: "Примечание",
  createdAt: "Дата события",
  rank: "Позиция",
  fromRank: "Предыдущая позиция",
  toRank: "Новая позиция",
  fromTier: "Прежний лист",
  toTier: "Новый лист",
  score: "Рейтинг",
  deletedAt: "Удаление",
};

function auditObject(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function changedFields(beforeJson: string | null, afterJson: string | null) {
  const before = auditObject(beforeJson);
  const after = auditObject(afterJson);
  const beforeValue = before?.event ?? before;
  const afterValue = after?.event ?? after;
  const explicit = Array.isArray(after?.fields) ? after.fields : [];
  const changed = Object.keys(afterValue ?? {}).filter(
    (key) =>
      JSON.stringify(beforeValue?.[key]) !== JSON.stringify(afterValue[key]),
  );
  return [
    ...new Set(
      [...explicit, ...changed]
        .filter(
          (key): key is string =>
            typeof key === "string" && Object.hasOwn(fieldLabels, key),
        )
        .map((key) => fieldLabels[key]!),
    ),
  ];
}

export function listAdminAudit(connection: Database.Database, query: unknown) {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success)
    throw createError({
      statusCode: 400,
      message: "Некорректные фильтры журнала",
    });
  const input = parsed.data;
  const base = `c.actorId IS NOT NULL AND c.kind IN (${kinds.map(() => "?").join(",")})`;
  const conditions = [base];
  const params: (string | number)[] = [...kinds];
  if (input.actorId) {
    conditions.push("c.actorId=?");
    params.push(input.actorId);
  }
  if (input.kind) {
    conditions.push("c.kind=?");
    params.push(input.kind);
  }
  if (input.search) {
    conditions.push("c.title LIKE ? ESCAPE '\\'");
    params.push(`%${input.search.replace(/[\\%_]/g, "\\$&")}%`);
  }
  const where = conditions.join(" AND ");
  const total = (
    connection
      .prepare(`SELECT COUNT(*) AS total FROM changes c WHERE ${where}`)
      .get(...params) as { total: number }
  ).total;
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 50)));
  const actorName =
    "COALESCE(NULLIF(p.name,''),NULLIF(a.nickname,''),a.login,'Аккаунт удалён')";
  const join =
    "LEFT JOIN accounts a ON a.id=c.actorId LEFT JOIN players p ON p.accountId=a.id AND p.deletedAt IS NULL";
  const items = (
    connection
      .prepare(
        `SELECT c.id,c.kind,c.title,c.actorId,${actorName} AS actorName,c.entityId,c.createdAt,c.beforeJson,c.afterJson FROM changes c ${join} WHERE ${where} ORDER BY c.createdAt DESC,c.id DESC LIMIT 50 OFFSET ?`,
      )
      .all(...params, (page - 1) * 50) as {
      id: number;
      kind: string;
      title: string;
      actorId: number;
      actorName: string;
      entityId: number | null;
      createdAt: string;
      beforeJson: string | null;
      afterJson: string | null;
    }[]
  ).map(({ beforeJson, afterJson, ...item }) => ({
    ...item,
    fields: changedFields(beforeJson, afterJson),
  }));
  const actors = connection
    .prepare(
      `SELECT DISTINCT c.actorId AS id,${actorName} AS name FROM changes c ${join} WHERE ${base} ORDER BY name`,
    )
    .all(...kinds) as { id: number; name: string }[];
  const presentKinds = connection
    .prepare(
      `SELECT DISTINCT c.kind FROM changes c WHERE ${base} ORDER BY c.kind`,
    )
    .all(...kinds) as { kind: string }[];
  return {
    items,
    total,
    page,
    actors,
    kinds: presentKinds.map((row) => row.kind),
  };
}
