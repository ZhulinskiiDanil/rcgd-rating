import type { DataSet, Ranking } from "../types/domain";
import {
  districtRating,
  effectivePercent,
  isCurrentLevel,
  playerRating,
  rankEntries,
  reconcileList,
  withinListBoundary,
  completedLevels,
} from "./rating";

export interface PlannedResult {
  levelId: number;
  percent: number;
  listPercent?: number | null;
  endPercent?: number | null;
}
export type ForecastEntity = "players" | "districts";
function rankings(
  data: DataSet,
  type: ForecastEntity,
): (Ranking & { id: number; rank: number | null })[] {
  const completed = completedLevels(data);
  if (type === "players")
    return rankEntries(
      data.players
        .filter((p) => !p.deletedAt && !p.hidden)
        .map((p) => ({ id: p.id, ...playerRating(data, p.id, completed) })),
    );
  const entries = data.districts.map((d) => ({
    id: d.id,
    ...districtRating(data, d.id, completed),
  }));
  const active = entries.filter((d) =>
    d.top.some((r) => r.kind === "completion"),
  );
  const ranked = rankEntries(active);
  return [
    ...ranked,
    ...entries
      .filter((d) => !active.includes(d))
      .map((d) => ({ ...d, rank: null })),
  ];
}

export function forecastRating(
  source: DataSet,
  type: ForecastEntity,
  entityId: number,
  plans: PlannedResult[],
) {
  if (type === "players" && entityId === 0)
    source = {
      ...source,
      players: [
        ...source.players,
        {
          id: 0,
          name: "Новый игрок",
          districtId: null,
          gdlId: null,
          bio: "",
          accountId: null,
          avatarUrl: "",
          inactive: 0,
        },
      ],
    };
  if (!source[type].some((entity) => entity.id === entityId))
    throw new Error("Выбери игрока или район.");
  // Only the copies change: the public catalog is shared with other pages.
  const data: DataSet = {
    ...source,
    levels: source.levels.map((l) => ({ ...l })),
    records: source.records.map((r) => ({ ...r })),
    extras: source.extras.map((e) => ({ ...e })),
  };
  const before = rankings(source, type).find((r) => r.id === entityId) ?? {
    id: entityId,
    rank: null,
    ...playerRating(source, entityId),
  };
  for (const plan of plans) {
    const level = data.levels.find((l) => l.id === plan.levelId);
    if (
      !level ||
      level.listExcluded ||
      level.deletedAt ||
      !withinListBoundary(level, data.levels) ||
      level.status === "legacy"
    )
      throw new Error("Этот уровень недоступен для новых результатов.");
    if (
      !Number.isFinite(plan.percent) ||
      plan.percent <= 0 ||
      plan.percent > 100 ||
      (type === "districts" && plan.percent !== 100)
    )
      throw new Error(
        "Укажи процент от 1 до 100. Районам засчитываются только прохождения.",
      );
    if (level.globalRank === null && level.manualPosition === null)
      throw new Error("У уровня ещё нет позиции для расчёта.");
    if (plan.listPercent !== undefined || plan.endPercent !== undefined) {
      const t =
        plan.listPercent === undefined ? level.listPercent : plan.listPercent;
      const T =
        plan.endPercent === undefined ? level.endPercent : plan.endPercent;
      if (
        t === null ||
        T === null ||
        !Number.isFinite(t) ||
        !Number.isFinite(T) ||
        t <= 0 ||
        T <= t ||
        T > 100
      )
        throw new Error("Для пробы прогресса нужны 0 < t < T ≤ 100.");
      level.listPercent = t;
      level.endPercent = T;
    }
    if (type === "districts") {
      if (
        !data.extras.some(
          (e) =>
            e.districtId === entityId && e.levelId === level.id && !e.deletedAt,
        )
      )
        data.extras.push({
          id: -data.extras.length - 1,
          districtId: entityId,
          levelId: level.id,
          note: "",
          achievedAt: null,
        });
    } else {
      const record = data.records.find(
        (r) =>
          r.playerId === entityId && r.levelId === level.id && !r.deletedAt,
      );
      if (record) {
        if (!record.active) {
          record.importedPercent = null;
          record.importedId = null;
        }
        record.manualPercent = Math.max(effectivePercent(record), plan.percent);
        record.active = 1;
      } else
        data.records.push({
          id: -data.records.length - 1,
          playerId: entityId,
          levelId: level.id,
          manualPercent: plan.percent,
          importedPercent: null,
          importedId: null,
          manualVideo: "",
          importedVideo: "",
          active: 1,
          reviewNeeded: 0,
          missing: 0,
          note: "",
          achievedAt: null,
          dateSource: null,
          sourceVideo: "",
          deletedAt: null,
          updatedAt: "",
        });
    }
  }
  data.levels = reconcileList(data);
  const after = rankings(data, type).find((r) => r.id === entityId) ?? {
    id: entityId,
    rank: null,
    ...playerRating(data, entityId),
  };
  const previousLevels = new Map(source.levels.map((l) => [l.id, l]));
  const changes = data.levels.flatMap((level) => {
    const old = previousLevels.get(level.id)!;
    const from = isCurrentLevel(old) ? old.localRank : null;
    return from !== level.localRank || old.status !== level.status
      ? [
          {
            id: level.id,
            name: level.name,
            from,
            to: level.localRank,
            fromTier: old.status,
            toTier: level.status,
          },
        ]
      : [];
  });
  return {
    before,
    after,
    levels: data.levels,
    changes,
    currentCount: data.levels.filter(isCurrentLevel).length,
  };
}
