import type { Level } from "../../shared/types/domain";
import type { GlobalLevel } from "./sources";

type StoredVersion = Pick<
  Level,
  | "gdlId"
  | "gameVersion"
  | "status"
  | "localRank"
  | "listExcluded"
  | "deletedAt"
>;

export function gameVersionBatch(
  levels: GlobalLevel[],
  stored: StoredVersion[],
  cursor: number | null,
) {
  const known = new Map(stored.map((level) => [level.gdlId, level]));
  const missing = levels.filter(
    (level) => !level.game_version && !known.get(level.id)?.gameVersion,
  );
  const priorityIds = new Set(
    stored
      .filter(
        (level) =>
          !level.deletedAt &&
          !level.listExcluded &&
          (level.status === "main" || level.status === "extended"),
      )
      .map((level) => level.gdlId),
  );
  const priority = missing
    .filter((level) => priorityIds.has(level.id))
    .sort(
      (a, b) =>
        (known.get(a.id)?.localRank ?? Infinity) -
        (known.get(b.id)?.localRank ?? Infinity),
    );
  const remaining = missing.filter((level) => !priorityIds.has(level.id));
  const order = new Map(levels.map((level, index) => [level.id, index]));
  const after = cursor === null ? -1 : (order.get(cursor) ?? -1);
  const start = remaining.findIndex((level) => order.get(level.id)! > after);
  const rotated =
    start > 0
      ? [...remaining.slice(start), ...remaining.slice(0, start)]
      : remaining;
  const batch = [...priority, ...rotated].slice(0, 200);
  const nextCursor =
    batch.filter((level) => !priorityIds.has(level.id)).at(-1)?.id ?? cursor;
  return { batch, nextCursor, missingCount: missing.length };
}
