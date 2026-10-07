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
  if (cause.toTier === null) return `${cause.name} удалён из листа`;
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

export function storedLevelNote(
  levelId: number,
  primaryId: number | null,
  afterJson: string | null,
): string {
  if (!afterJson) return "";
  let json: unknown;
  try {
    json = JSON.parse(afterJson);
  } catch {
    return "";
  }
  const parsed = storedMovements.safeParse(json);
  if (!parsed.success) return "";
  const movements = parsed.data.movements.map((movement) => ({
    ...movement,
    note: movement.note ?? "",
  }));
  if (
    new Set(movements.map((movement) => movement.levelId)).size !==
    movements.length
  )
    return "";
  const movement = movements.find((item) => item.levelId === levelId);
  if (!movement) return "";
  if (movement.note) return movement.note;
  const primary = movements.find((item) => item.levelId === primaryId);
  if (!primary) return "";
  return movement === primary
    ? primaryNote(movement)
    : (causedBy(movement, primary) ?? "");
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
    if (primary.includes(movement)) {
      movement.note = primaryNote(movement);
      continue;
    }
    movement.note = primary
      .map((cause) => causedBy(movement, cause))
      .filter(Boolean)
      .join("; ");
  }
  const neighbors = (rank: number | null) => {
    if (rank === null) return "";
    const lower = current[rank]?.name;
    const higher = current[rank - 2]?.name;
    return `${lower ? ` выше «${lower}»` : ""}${higher ? `${lower ? " и" : ""} ниже «${higher}»` : ""}`;
  };
  const descriptions = primary.slice(0, 5).map((movement) => {
    if (movement.toRank === null)
      return movement.toTier === "legacy"
        ? `«${movement.name}» подвинут с ${movement.fromRank} места в Legacy list`
        : `«${movement.name}» удалён из листа`;
    if (movement.fromTier === "legacy")
      return `«${movement.name}» подвинут из Legacy list на ${movement.toRank} место${neighbors(movement.toRank)}`;
    if (movement.fromRank === null)
      return `«${movement.name}» поставлен в топ на ${movement.toRank} место${neighbors(movement.toRank)}`;
    return `«${movement.name}» был ${movement.toRank < movement.fromRank ? "повышен" : "понижен"} с ${movement.fromRank} на ${movement.toRank} место${neighbors(movement.toRank)}`;
  });
  if (primary.length > 5)
    descriptions.push(`и ещё ${primary.length - 5} изменений порядка`);
  const transitions = movements.filter(
    (movement) =>
      movement.fromTier &&
      movement.toTier &&
      movement.fromTier !== movement.toTier &&
      movement.fromTier !== "legacy" &&
      !primary.some((item) => item.levelId === movement.levelId),
  );
  if (transitions.length)
    descriptions.push(
      `${descriptions.length ? "В связи с этим " : ""}${transitions.map((movement) => `«${movement.name}» ${movement.toTier === "legacy" ? "подвинут в" : "переходит в"} ${tierNames[movement.toTier!]}`).join(", ")}`,
    );
  if (!descriptions.length)
    descriptions.push("Обновлён порядок уровней в листе");
  return {
    title: descriptions.join(". "),
    movements,
    entityId: primary.length === 1 ? primary[0]!.levelId : null,
  };
}
