import type {
  DataSet,
  Level,
  RecordEntry,
  RatedResult,
  Ranking,
} from "../types/domain";
export const WEIGHTS = [10, 9, 8, 7, 5, 3] as const;
export const EMPTY_POSITION = 150;
export const normalizedName = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export const effectivePercent = (record: RecordEntry) =>
  record.active
    ? Math.max(record.manualPercent ?? 0, record.importedPercent ?? 0)
    : 0;

export function completedLevels(data: DataSet): Level[] {
  const ids = new Set(
    data.records
      .filter((r) => effectivePercent(r) === 100)
      .map((r) => r.levelId),
  );
  data.extras.forEach((r) => ids.add(r.levelId));
  return data.levels
    .filter((l) => (l.verifiedLocal || ids.has(l.id)) && l.globalRank !== null)
    .sort((a, b) => a.globalRank! - b.globalRank! || a.id - b.id);
}

export function hypotheticalPosition(
  level: Level,
  completed: Level[],
): number | null {
  if (level.globalRank === null) return null;
  return (
    1 +
    completed.filter(
      (l) => l.id !== level.id && l.globalRank! < level.globalRank!,
    ).length
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

export function weightedTop(results: RatedResult[]): Ranking {
  const unique = new Map<number, RatedResult>();
  for (const r of results) {
    if (r.levelId === null || r.position > EMPTY_POSITION || r.position < 1)
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
    score: top.reduce((sum, r, i) => sum + r.position * WEIGHTS[i]!, 0) / 42,
  };
}

export function playerRating(data: DataSet, playerId: number): Ranking {
  const completed = completedLevels(data);
  const levels = new Map(data.levels.map((l) => [l.id, l]));
  const results: RatedResult[] = [];
  for (const record of data.records.filter((r) => r.playerId === playerId)) {
    const level = levels.get(record.levelId),
      percent = effectivePercent(record);
    if (!level || !percent) continue;
    const h = hypotheticalPosition(level, completed);
    if (h === null) continue;
    const position =
      percent === 100
        ? h
        : level.globalRank! <= 150
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
  return weightedTop(results);
}

export function districtRating(data: DataSet, districtId: number): Ranking {
  const players = new Set(
    data.players.filter((p) => p.districtId === districtId).map((p) => p.id),
  );
  const ids = new Set(
    data.records
      .filter((r) => players.has(r.playerId) && effectivePercent(r) === 100)
      .map((r) => r.levelId),
  );
  data.extras
    .filter((e) => e.districtId === districtId)
    .forEach((e) => ids.add(e.levelId));
  return weightedTop(
    completedLevels(data).flatMap((l, i) =>
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
