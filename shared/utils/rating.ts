import type {
  DataSet,
  Level,
  RecordEntry,
  RatedResult,
  Ranking,
} from "../types/domain";
export const EMPTY_POSITION = 150;
export const normalizedName = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export const effectivePercent = (record: RecordEntry) =>
  record.active && !record.deletedAt
    ? Math.max(record.manualPercent ?? 0, record.importedPercent ?? 0)
    : 0;

function completedIds(data: DataSet): Set<number> {
  const players = new Set(
    data.players
      .filter((player) => !player.deletedAt)
      .map((player) => player.id),
  );
  const ids = new Set(
    data.records
      .filter((r) => players.has(r.playerId) && effectivePercent(r) === 100)
      .map((r) => r.levelId),
  );
  data.extras
    .filter((extra) => !extra.deletedAt)
    .forEach((r) => ids.add(r.levelId));
  return ids;
}

export function listBoundary(levels: Level[]): number | null {
  const mika = levels.find(
    (entry) =>
      normalizedName(entry.name) === "mika" && entry.globalRank !== null,
  );
  return mika?.globalRank ?? null;
}

export function withinListBoundary(
  level: Level,
  levels: Level[],
  boundary = listBoundary(levels),
): boolean {
  return (
    boundary === null ||
    level.globalRank === null ||
    level.globalRank <= boundary
  );
}

export function completedLevels(data: DataSet): Level[] {
  const ids = completedIds(data);
  const boundary = listBoundary(data.levels);
  const eligible = data.levels.filter(
    (l) =>
      !l.listExcluded &&
      !l.deletedAt &&
      withinListBoundary(l, data.levels, boundary) &&
      (l.verifiedLocal || ids.has(l.id)),
  );
  return orderLevels(eligible);
}

function orderLevels(eligible: Level[]): Level[] {
  const global = eligible
    .filter((l) => l.globalRank !== null)
    .sort((a, b) => a.globalRank! - b.globalRank! || a.id - b.id);
  const manual = eligible
    .filter(
      (l) =>
        l.globalRank === null &&
        l.manualPosition !== null &&
        l.manualPosition !== undefined,
    )
    .sort((a, b) => a.manualPosition! - b.manualPosition! || a.id - b.id);
  const ordered: Level[] = [];
  let globalIndex = 0,
    manualIndex = 0;
  while (globalIndex < global.length || manualIndex < manual.length) {
    if (
      manualIndex < manual.length &&
      (globalIndex >= global.length ||
        manual[manualIndex]!.manualPosition! <= ordered.length + 1)
    )
      ordered.push(manual[manualIndex++]!);
    else ordered.push(global[globalIndex++]!);
  }
  return ordered;
}

export type ListTier = "main" | "extended" | "legacy";
export function listTier(level: Level): ListTier | null {
  if (level.listExcluded || level.deletedAt) return null;
  if (level.status === "legacy") return "legacy";
  if (
    (level.status === "main" || level.status === "extended") &&
    level.localRank &&
    level.localRank <= 150
  )
    return level.localRank <= 75 ? "main" : "extended";
  return null;
}
export const isCurrentLevel = (level: Level) =>
  listTier(level) === "main" || listTier(level) === "extended";
export const hasLevelPage = (level: Level) => listTier(level) !== null;

export function reconcileList(
  data: DataSet,
  now = new Date().toISOString(),
): Level[] {
  const positions = new Map(
    completedLevels(data).map((level, i) => [level.id, i + 1]),
  );
  const proofIds = completedIds(data);
  const boundary = listBoundary(data.levels);
  return data.levels.map((level) => {
    if (level.deletedAt) return { ...level, localRank: null };
    const position = positions.get(level.id) ?? null;
    const current =
      !level.listExcluded &&
      !level.deletedAt &&
      position !== null &&
      position <= 150;
    const wasCurrent = level.status === "main" || level.status === "extended";
    const status: Level["status"] =
      level.listExcluded ||
      level.deletedAt ||
      !(level.verifiedLocal || proofIds.has(level.id))
        ? "catalog"
        : current
          ? position <= 75
            ? "main"
            : "extended"
          : wasCurrent || level.status === "legacy"
            ? "legacy"
            : "catalog";
    return {
      ...level,
      status,
      localRank: current ? position : null,
      enteredAt: current && !wasCurrent ? now : level.enteredAt,
      exitedAt:
        status === "legacy"
          ? level.status === "legacy"
            ? level.exitedAt
            : now
          : null,
      lastMainRank: current
        ? position
        : level.listExcluded
          ? null
          : level.lastMainRank,
      exitReason:
        status !== "legacy"
          ? null
          : !withinListBoundary(level, data.levels, boundary)
            ? "Ниже Mika"
            : position === null
              ? "Нет активного подтверждённого прохождения или позиции"
              : "Вне топа-150 СПб",
    };
  });
}

export function rankEntries<T extends { score: number; id: number }>(
  entries: T[],
): (T & { rank: number })[] {
  let previous: number | null = null;
  let place = 0;
  return [...entries]
    .sort((a, b) => a.score - b.score || a.id - b.id)
    .map((entry) => {
      if (previous === null || Math.abs(entry.score - previous) > 1e-9)
        place += 1;
      previous = entry.score;
      return { ...entry, rank: place };
    });
}

export function hypotheticalPosition(
  level: Level,
  completed: Level[],
): number | null {
  if (level.listExcluded || level.deletedAt) return null;
  const existing = completed.findIndex((item) => item.id === level.id);
  if (existing >= 0) return existing + 1;
  if (level.globalRank === null && !level.manualPosition) return null;
  return (
    orderLevels([...completed, level]).findIndex(
      (item) => item.id === level.id,
    ) + 1
  );
}

export function progressPosition(
  h: number,
  c: number,
  t: number | null,
  T: number | null,
): number | null {
  if (
    t === null ||
    T === null ||
    t <= 0 ||
    T <= t ||
    T > 100 ||
    c < t ||
    c >= 100
  )
    return null;
  // Progress after the last possible death has the maximum-progress coefficient (2h).
  const result =
    h * 2 * (T / Math.min(c, T)) ** (Math.log(2) / Math.log(T / t));
  return Number.isFinite(result) && result <= EMPTY_POSITION ? result : null;
}

export function geometricMean(positions: number[]): number {
  return (
    positions.reduce((product, position) => product * position, 1) **
    (1 / positions.length)
  );
}

export function geometricTop(results: RatedResult[]): Ranking {
  const unique = new Map<number, RatedResult>();
  for (const r of results) {
    if (
      r.levelId === null ||
      !Number.isFinite(r.position) ||
      r.position > EMPTY_POSITION ||
      r.position < 1
    )
      continue;
    const old = unique.get(r.levelId);
    if (!old || r.position < old.position) unique.set(r.levelId, r);
  }
  const top = [...unique.values()]
    .sort((a, b) => a.position - b.position || a.levelId! - b.levelId!)
    .slice(0, 6);
  while (top.length < 6)
    top.push({
      levelId: null,
      name: "Нет результата",
      percent: 0,
      position: EMPTY_POSITION,
      kind: "empty",
    });
  return {
    top,
    score: top.every((result) => result.position === EMPTY_POSITION)
      ? EMPTY_POSITION
      : geometricMean(top.map((result) => result.position)),
  };
}

export function playerRating(
  data: DataSet,
  playerId: number,
  completed = completedLevels(data),
): Ranking {
  if (
    !data.players.some((player) => player.id === playerId && !player.deletedAt)
  )
    return geometricTop([]);
  const boundary = listBoundary(data.levels);
  const positions = new Map(
    completed.map((level, index) => [level.id, index + 1]),
  );
  const levels = new Map(data.levels.map((l) => [l.id, l]));
  const results: RatedResult[] = [];
  for (const record of data.records.filter((r) => r.playerId === playerId)) {
    const level = levels.get(record.levelId),
      percent = effectivePercent(record);
    if (
      !level ||
      level.listExcluded ||
      level.deletedAt ||
      !withinListBoundary(level, data.levels, boundary) ||
      !percent
    )
      continue;
    if (percent < 100 && (level.globalRank === null || level.globalRank > 150))
      continue;
    const h =
      positions.get(level.id) ??
      (percent < 100 ? hypotheticalPosition(level, completed) : null);
    if (h === null) continue;
    const position =
      percent === 100
        ? h
        : level.globalRank !== null && level.globalRank <= 150
          ? progressPosition(h, percent, level.listPercent, level.endPercent)
          : null;
    if (position !== null)
      results.push({
        levelId: level.id,
        name: level.name,
        percent,
        position,
        kind: percent === 100 ? "completion" : "progress",
      });
  }
  return geometricTop(results);
}

export function districtRating(
  data: DataSet,
  districtId: number,
  completed = completedLevels(data),
): Ranking {
  const players = new Set(
    data.players
      .filter((p) => p.districtId === districtId && !p.deletedAt)
      .map((p) => p.id),
  );
  const ids = new Set(
    data.records
      .filter((r) => players.has(r.playerId) && effectivePercent(r) === 100)
      .map((r) => r.levelId),
  );
  data.extras
    .filter((e) => e.districtId === districtId && !e.deletedAt)
    .forEach((e) => ids.add(e.levelId));
  return geometricTop(
    completed.flatMap((l, i) =>
      ids.has(l.id)
        ? [
            {
              levelId: l.id,
              name: l.name,
              percent: 100,
              position: i + 1,
              kind: "completion" as const,
            },
          ]
        : [],
    ),
  );
}
