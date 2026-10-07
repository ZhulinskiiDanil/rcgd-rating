import type {
  District,
  DistrictExtra,
  Player,
  RecordEntry,
} from "../types/domain";

type CompletionRecord = Pick<
  RecordEntry,
  | "id"
  | "playerId"
  | "levelId"
  | "active"
  | "manualPercent"
  | "importedPercent"
  | "achievedAt"
> &
  Partial<
    Pick<RecordEntry, "deletedAt" | "isFirstRk" | "isFirstSpb" | "isFirstLo">
  >;
export interface VictorData {
  players: (Pick<Player, "id" | "name" | "districtId"> &
    Partial<Pick<Player, "deletedAt">>)[];
  districts: District[];
  records: CompletionRecord[];
  extras?: (Pick<DistrictExtra, "districtId" | "levelId" | "achievedAt"> &
    Partial<Pick<DistrictExtra, "deletedAt">>)[];
}
export interface Victor {
  playerId: number;
  name: string;
  achievedAt: string | null;
  districtId: number | null;
  region: District["region"] | null;
  isFirstRk: boolean;
  isFirstSpb: boolean;
  isFirstLo: boolean;
}
export interface RegionalFirstVictor {
  region: District["region"];
  label: string;
  firstDate: string | null;
  victors: Victor[];
  hasUndated: boolean;
  hasCompletions: boolean;
  manual: boolean;
}
export interface FirstLevelVictor {
  firstDate: string | null;
  victors: Victor[];
  knownVictors: Victor[];
  hasUndated: boolean;
  hasCompletions: boolean;
}

function completionDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function compareCompletionDates(
  a: string | null,
  b: string | null,
): number {
  const first = completionDate(a),
    second = completionDate(b);
  if (first && second) return first.localeCompare(second);
  return first ? -1 : second ? 1 : 0;
}

export function formatCompletionDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("ru-RU", {
    timeZone: "UTC",
  });
}

export function levelVictors(
  data: VictorData,
  levelId: number,
  districtId?: number,
): Victor[] {
  const players = new Map(data.players.map((player) => [player.id, player]));
  const districts = new Map(
    data.districts.map((district) => [district.id, district]),
  );
  const victors = new Map<number, Victor>();
  for (const record of data.records) {
    if (
      record.levelId !== levelId ||
      !record.active ||
      record.deletedAt ||
      Math.max(record.manualPercent ?? 0, record.importedPercent ?? 0) !== 100
    )
      continue;
    const player = players.get(record.playerId);
    if (
      !player ||
      player.deletedAt ||
      (districtId !== undefined && player.districtId !== districtId)
    )
      continue;
    const achievedAt = completionDate(record.achievedAt);
    const previous = victors.get(player.id);
    if (
      previous &&
      compareCompletionDates(previous.achievedAt, achievedAt) <= 0
    ) {
      previous.isFirstRk ||= !!record.isFirstRk;
      previous.isFirstSpb ||= !!record.isFirstSpb;
      previous.isFirstLo ||= !!record.isFirstLo;
      continue;
    }
    victors.set(player.id, {
      playerId: player.id,
      name: player.name,
      achievedAt,
      isFirstRk: !!record.isFirstRk || !!previous?.isFirstRk,
      isFirstSpb: !!record.isFirstSpb || !!previous?.isFirstSpb,
      isFirstLo: !!record.isFirstLo || !!previous?.isFirstLo,
      districtId: player.districtId,
      region:
        player.districtId === null
          ? null
          : (districts.get(player.districtId)?.region ?? null),
    });
  }
  return [...victors.values()].sort(
    (a, b) =>
      compareCompletionDates(a.achievedAt, b.achievedAt) ||
      a.name.localeCompare(b.name, "ru") ||
      a.playerId - b.playerId,
  );
}

export function regionalFirstVictors(
  data: VictorData,
  levelId: number,
): RegionalFirstVictor[] {
  const allVictors = levelVictors(data, levelId);
  const districts = new Map(
    data.districts.map((district) => [district.id, district]),
  );
  return (["spb", "lo"] as const)
    .map((region): RegionalFirstVictor => {
      const victors = allVictors.filter((victor) => victor.region === region);
      const extraDates = (data.extras ?? [])
        .filter(
          (extra) =>
            !extra.deletedAt &&
            extra.levelId === levelId &&
            districts.get(extra.districtId)?.region === region,
        )
        .map((extra) => completionDate(extra.achievedAt));
      const dates = [
        ...victors.map((victor) => victor.achievedAt),
        ...extraDates,
      ];
      const marked = victors.filter((victor) =>
        region === "spb" ? victor.isFirstSpb : victor.isFirstLo,
      );
      const firstDates = marked.length
        ? marked.map((victor) => victor.achievedAt)
        : dates;
      const firstDate =
        firstDates.filter((date): date is string => date !== null).sort()[0] ??
        null;
      return {
        region,
        label: region === "spb" ? "Санкт-Петербург" : "Ленинградская область",
        firstDate,
        victors: marked.length
          ? marked
          : firstDate
            ? victors.filter((victor) => victor.achievedAt === firstDate)
            : victors.length === 1
              ? victors
              : [],
        hasUndated: dates.includes(null),
        hasCompletions: dates.length > 0,
        manual: marked.length > 0,
      };
    })
    .sort((a, b) => compareCompletionDates(a.firstDate, b.firstDate));
}

export function firstLevelVictors(
  data: VictorData,
  levelId: number,
): FirstLevelVictor {
  const knownVictors = levelVictors(data, levelId);
  const extras = (data.extras ?? []).filter(
    (extra) => !extra.deletedAt && extra.levelId === levelId,
  );
  const dates = [
    ...knownVictors.map((victor) => victor.achievedAt),
    ...extras.map((extra) => completionDate(extra.achievedAt)),
  ];
  const firstDate =
    dates.filter((date): date is string => date !== null).sort()[0] ?? null;
  return {
    firstDate,
    victors: firstDate
      ? knownVictors.filter((victor) => victor.achievedAt === firstDate)
      : knownVictors.length === 1
        ? knownVictors
        : [],
    knownVictors,
    hasUndated: dates.includes(null),
    hasCompletions: dates.length > 0,
  };
}
