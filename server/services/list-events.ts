import type { Level } from "../../shared/types/domain";
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
}
const tierNames = {
  main: "Main list",
  extended: "Extended list",
  legacy: "Legacy list",
};

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
          },
        ];
  });
  if (!movements.length) return null;
  const reordered = movedLevels(oldCurrent, current);
  const primary = movements.filter(
    (movement) =>
      (movement.fromRank === null && movement.toRank !== null) ||
      reordered.has(movement.levelId) ||
      after.find((level) => level.id === movement.levelId)!.listExcluded,
  );
  const neighbors = (rank: number | null) => {
    if (rank === null) return "";
    const lower = current[rank]?.name;
    const higher = current[rank - 2]?.name;
    return `${lower ? ` выше «${lower}»` : ""}${higher ? `${lower ? " и" : ""} ниже «${higher}»` : ""}`;
  };
  const descriptions = primary.slice(0, 5).map((movement) => {
    if (movement.toRank === null) return `«${movement.name}» удалён из листа`;
    if (movement.fromTier === "legacy")
      return `«${movement.name}» вернулся в ${tierNames[movement.toTier!]} на ${movement.toRank} место${neighbors(movement.toRank)}`;
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
      !primary.some(
        (item) =>
          item.levelId === movement.levelId && item.fromTier === "legacy",
      ),
  );
  if (transitions.length)
    descriptions.push(
      `${descriptions.length ? "В связи с этим " : ""}${transitions.map((movement) => `«${movement.name}» ${movement.toTier === "legacy" ? "вылетает в" : movement.fromTier === "legacy" ? "возвращается в" : "переходит в"} ${tierNames[movement.toTier!]}`).join(", ")}`,
    );
  if (!descriptions.length)
    descriptions.push("Обновлён порядок уровней в листе");
  return {
    title: descriptions.join(". "),
    movements,
    entityId: primary.length === 1 ? primary[0]!.levelId : null,
  };
}
