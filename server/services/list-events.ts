import type { Level } from "../../shared/types/domain";
import { z } from "zod";
import {
  isCurrentLevel,
  listTier,
  type ListTier,
} from "../../shared/utils/rating";

export interface LevelMovement {
  levelId: number;
  name: string;
  fromRank: number | null;
  toRank: number | null;
  fromTier: ListTier | null;
  toTier: ListTier | null;
  note: string;
}
const tierNames = {
  main: "Main list",
  extended: "Extended list",
  legacy: "Legacy list",
};

export function withoutHistoryQuotes(text: string) {
  return text.replace(/[«»“”„"]/g, "");
}

export function formatHistoryText(text: string, names: string[] = []) {
  text = withoutHistoryQuotes(text).trim();
  const spans = names.filter(Boolean).flatMap((name) => {
    const result: [number, number][] = [];
    for (
      let start = text.indexOf(name);
      start >= 0;
      start = text.indexOf(name, start + name.length)
    )
      result.push([start, start + name.length]);
    return result;
  });
  return text
    .replace(/\.(?=\s|$)/g, (_match, index: number) =>
      spans.some(([start, end]) => start <= index && index < end)
        ? "."
        : index === text.length - 1
          ? ""
          : ",",
    )
    .replace(/вылетел в (Extended|Legacy) list/g, "вылетает в $1 list");
}

function primaryNote(movement: LevelMovement) {
  if (movement.toTier === null && movement.fromTier !== null)
    return "Удалён из листа";
  return movement.fromRank === null && movement.fromTier !== "legacy"
    ? "Добавлен в лист"
    : "Подвинут";
}
function causedBy(
  movement: LevelMovement,
  cause: LevelMovement,
): string | null {
  const oldAbove =
    cause.fromRank !== null && cause.fromRank < (movement.fromRank ?? Infinity);
  const newAbove =
    cause.toRank !== null && cause.toRank < (movement.toRank ?? Infinity);
  if (oldAbove === newAbove) return null;
  if (cause.toTier === null) return `${cause.name} удалён с позиции выше`;
  const added = cause.fromRank === null && cause.fromTier !== "legacy";
  return `${cause.name} ${added ? "поставлен" : "поставили"} ${newAbove ? "выше" : "ниже"} этого уровня`;
}

const storedMovements = z.object({
  movements: z.array(
    z.object({
      levelId: z.number().int().positive(),
      name: z.string().min(1),
      fromRank: z.number().int().positive().nullable(),
      toRank: z.number().int().positive().nullable(),
      fromTier: z.enum(["main", "extended", "legacy"]).nullable(),
      toTier: z.enum(["main", "extended", "legacy"]).nullable(),
      note: z.string().optional(),
    }),
  ),
});

export function readStoredMovements(afterJson: string | null): LevelMovement[] {
  if (!afterJson) return [];
  let json: unknown;
  try {
    json = JSON.parse(afterJson);
  } catch {
    return [];
  }
  const parsed = storedMovements.safeParse(json);
  if (!parsed.success) return [];
  const movements = parsed.data.movements.map((movement) => ({
    ...movement,
    note: movement.note ?? "",
  }));
  if (
    new Set(movements.map((movement) => movement.levelId)).size !==
    movements.length
  )
    return [];
  return movements;
}

export function correctRemovalNote(
  note: string,
  movement: LevelMovement,
  movements: LevelMovement[],
) {
  let corrected = note;
  const removalReasons: string[] = [];
  for (const cause of movements) {
    if (
      cause.levelId === movement.levelId ||
      cause.toTier !== null ||
      cause.fromRank === null ||
      (movement.fromRank === null && movement.fromTier !== "legacy") ||
      cause.fromRank >= (movement.fromRank ?? Infinity) ||
      movement.toRank === null ||
      (movement.fromRank !== null && movement.toRank >= movement.fromRank)
    )
      continue;
    removalReasons.push(`${cause.name} удалён с позиции выше`);
    for (const spelling of ["удалён", "удален"])
      corrected = corrected.replaceAll(
        `${cause.name} ${spelling} из листа`,
        `${cause.name} удалён с позиции выше`,
      );
  }
  if ((!corrected || corrected === "Подвинут") && removalReasons.length)
    return removalReasons.join("; ");
  return corrected;
}

export function storedLevelNote(
  levelId: number,
  primaryId: number | null,
  afterJson: string | null,
): string {
  const movements = readStoredMovements(afterJson);
  const movement = movements.find((item) => item.levelId === levelId);
  if (!movement) return "";
  if (movement.toTier === "legacy") {
    const entrants = movements.filter(
      (item) =>
        item.levelId !== levelId &&
        item.fromRank === null &&
        item.toRank !== null,
    );
    if (
      entrants.length === 1 &&
      (!movement.note || movement.note === "Подвинут")
    ) {
      const reason = causedBy(movement, entrants[0]!);
      if (reason) return withoutHistoryQuotes(reason);
    }
  }
  const correctedNote = correctRemovalNote(movement.note, movement, movements);
  if (correctedNote) return withoutHistoryQuotes(correctedNote);
  const primary = movements.find((item) => item.levelId === primaryId);
  if (!primary) return "";
  return withoutHistoryQuotes(
    movement === primary
      ? primaryNote(movement)
      : (causedBy(movement, primary) ?? ""),
  );
}

function movedLevels(before: Level[], after: Level[]) {
  const previous = new Map(before.map((level, i) => [level.id, i]));
  const common = after.filter((level) => previous.has(level.id));
  const lengths = common.map(() => 1);
  const costs = common.map((level) =>
    Math.abs(
      (before[previous.get(level.id)!]!.localRank ?? 0) -
        (level.localRank ?? 0),
    ),
  );
  const parents = common.map(() => -1);
  for (let i = 0; i < common.length; i++) {
    const ownCost = costs[i]!;
    for (let j = 0; j < i; j++) {
      if (previous.get(common[j]!.id)! >= previous.get(common[i]!.id)!)
        continue;
      const length = lengths[j]! + 1;
      const cost = costs[j]! + ownCost;
      if (
        length > lengths[i]! ||
        (length === lengths[i]! && cost < costs[i]!)
      ) {
        lengths[i] = length;
        costs[i] = cost;
        parents[i] = j;
      }
    }
  }
  let end = -1;
  for (let i = 0; i < common.length; i++)
    if (
      end < 0 ||
      lengths[i]! > lengths[end]! ||
      (lengths[i] === lengths[end] && costs[i]! < costs[end]!)
    )
      end = i;
  const stable = new Set<number>();
  while (end >= 0) {
    stable.add(common[end]!.id);
    end = parents[end]!;
  }
  return new Set(
    common.filter((level) => !stable.has(level.id)).map((level) => level.id),
  );
}

export function describeListChanges(before: Level[], after: Level[]) {
  const previous = new Map(before.map((level) => [level.id, level]));
  const current = after
    .filter(isCurrentLevel)
    .sort((a, b) => a.localRank! - b.localRank!);
  const oldCurrent = before
    .filter(isCurrentLevel)
    .sort((a, b) => a.localRank! - b.localRank!);
  const movements: LevelMovement[] = after.flatMap((level) => {
    const old = previous.get(level.id);
    const fromTier = old ? listTier(old) : null;
    const toTier = listTier(level);
    const fromRank = old && isCurrentLevel(old) ? old.localRank : null;
    const toRank = isCurrentLevel(level) ? level.localRank : null;
    return fromTier === toTier && fromRank === toRank
      ? []
      : [
          {
            levelId: level.id,
            name: level.name,
            fromRank,
            toRank,
            fromTier,
            toTier,
            note: "",
          },
        ];
  });
  if (!movements.length) return null;
  const reordered = movedLevels(oldCurrent, current);
  const primary = movements.filter(
    (movement) =>
      (movement.fromRank === null && movement.toRank !== null) ||
      (movement.fromRank !== null && movement.toRank === null) ||
      reordered.has(movement.levelId) ||
      after.find((level) => level.id === movement.levelId)!.listExcluded,
  );
  for (const movement of movements) {
    const reasons = primary
      .filter((cause) => cause !== movement)
      .map((cause) => causedBy(movement, cause))
      .filter(Boolean)
      .join("; ");
    if (
      reasons &&
      (movement.toTier === "legacy" ||
        (movement.fromTier === "legacy" &&
          primary.some((cause) => cause.toTier === null)))
    ) {
      movement.note = withoutHistoryQuotes(reasons);
      continue;
    }
    if (primary.includes(movement)) {
      movement.note = primaryNote(movement);
      continue;
    }
    movement.note = withoutHistoryQuotes(reasons);
  }
  const neighbors = (rank: number | null) => {
    if (rank === null) return "";
    const lower = current[rank]?.name;
    const higher = current[rank - 2]?.name;
    return `${lower ? ` выше ${lower}` : ""}${higher ? `${lower ? " и" : ""} ниже ${higher}` : ""}`;
  };
  const legacyDescription = (movement: LevelMovement) => {
    const reason =
      movement.note && movement.note !== "Подвинут" ? `, ${movement.note}` : "";
    return `${movement.name} вылетает в Legacy list с ${movement.fromRank} места${reason}`;
  };
  const transitions = movements
    .filter(
      (movement) =>
        movement.fromTier &&
        movement.toTier &&
        movement.fromTier !== movement.toTier,
    )
    .sort(
      (a, b) =>
        Number(!(a.fromTier === "main" && a.toTier === "extended")) -
          Number(!(b.fromTier === "main" && b.toTier === "extended")) ||
        (a.toRank ?? Infinity) - (b.toRank ?? Infinity),
    );
  const hasNewLevel = primary.some(
    (movement) => movement.fromTier === null && movement.toRank !== null,
  );
  const descriptions = transitions.map((movement) => {
    if (movement.toTier === "legacy")
      return hasNewLevel
        ? `${movement.name} вылетает в Legacy list`
        : legacyDescription(movement);
    const returned =
      movement.fromTier === "legacy" ||
      (movement.fromTier === "extended" && movement.toTier === "main");
    if (returned)
      return `${movement.name} вернулся в ${tierNames[movement.toTier!]}`;
    if (hasNewLevel)
      return `${movement.name} вылетает в ${tierNames[movement.toTier!]}`;
    return `${movement.name} вылетает в ${tierNames[movement.toTier!]} на ${movement.toRank} место${movement.fromRank !== null ? ` (был на ${movement.fromRank} месте)` : ""}${primary.includes(movement) ? neighbors(movement.toRank) : ""}`;
  });
  const ordinary = primary.filter(
    (movement) => !transitions.includes(movement),
  );
  const removed = ordinary.filter((movement) => movement.toTier === null);
  const remaining = ordinary.filter((movement) => !removed.includes(movement));
  const ordinaryDescriptions = remaining.slice(0, 5).map((movement) => {
    if (movement.toRank === null)
      return movement.toTier === "legacy"
        ? legacyDescription(movement)
        : `${movement.name} удалён из листа`;
    if (movement.fromTier === "legacy")
      return `${movement.name} вернулся в ${tierNames[movement.toTier!]}`;
    if (movement.fromRank === null)
      return `${movement.name} поставлен в топ на ${movement.toRank} место${neighbors(movement.toRank)}`;
    return `${movement.name} был ${movement.toRank < movement.fromRank ? "повышен" : "понижен"} с ${movement.fromRank} на ${movement.toRank} место${neighbors(movement.toRank)}`;
  });
  if (hasNewLevel) descriptions.unshift(...ordinaryDescriptions);
  else descriptions.push(...ordinaryDescriptions);
  descriptions.unshift(
    ...removed.map((movement) => `${movement.name} удалён из листа`),
  );
  if (remaining.length > 5)
    descriptions.push(`и ещё ${remaining.length - 5} изменений порядка`);
  if (!descriptions.length)
    descriptions.push("Обновлён порядок уровней в листе");
  return {
    title: withoutHistoryQuotes(descriptions.join(", ")),
    movements,
    entityId: primary.length === 1 ? primary[0]!.levelId : null,
  };
}
