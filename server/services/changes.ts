import { db, dataset } from "../database";
import { reconcileList, effectivePercent } from "../../shared/utils/rating";
import type { DataSet } from "../../shared/types/domain";
import { rankings } from "./rankings";
import { describeListChanges } from "./list-events";
import { districtGenitive, districtSubject } from "./district-history";
import {
  clearBelowMikaVideos,
  refreshRegionalVictorFlags,
} from "../database/record-controls";

const publicKinds = new Set(["level", "player-rating", "district-rating"]);

function achievements(
  data: DataSet,
  type: "players" | "districts",
  id: number,
) {
  const players = new Set(
    data.players
      .filter(
        (p) =>
          !p.deletedAt &&
          (type === "players" ? p.id === id : p.districtId === id),
      )
      .map((p) => p.id),
  );
  const results = data.records
    .filter(
      (r) =>
        players.has(r.playerId) &&
        (type === "districts"
          ? effectivePercent(r) === 100
          : effectivePercent(r) > 0),
    )
    .map((r) => `${r.levelId}:${effectivePercent(r)}`);
  if (type === "districts")
    results.push(
      ...data.extras
        .filter((e) => e.districtId === id && !e.deletedAt)
        .map((e) => `${e.levelId}:100`),
    );
  return [...new Set(results)].sort().join(",");
}

export function logChange(
  kind: string,
  entityId: number | null,
  title: string,
  before: unknown = null,
  after: unknown = null,
  actorId: number | null = null,
  isPublic = true,
) {
  return Number(
    db()
      .prepare(
        "INSERT INTO changes(kind,entityId,title,beforeJson,afterJson,actorId,public) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        kind,
        entityId,
        title,
        JSON.stringify(before),
        JSON.stringify(after),
        actorId,
        Number(isPublic && publicKinds.has(kind)),
      ).lastInsertRowid,
  );
}

export function reconcileLevels() {
  const levels = reconcileList(dataset());
  const update = db().prepare(
    "UPDATE levels SET localRank=?, status=?, enteredAt=?, exitedAt=?, lastMainRank=?, exitReason=? WHERE id=?",
  );
  for (const l of levels) {
    update.run(
      l.localRank,
      l.status,
      l.enteredAt,
      l.exitedAt,
      l.lastMainRank,
      l.exitReason,
      l.id,
    );
  }
}

export function mutate<T>(
  reason: string,
  actorId: number | null,
  operation: () => T,
): T {
  return db().transaction(() => {
    const before = dataset(),
      previous = rankings(before);
    const result = operation();
    clearBelowMikaVideos(db());
    refreshRegionalVictorFlags(db());
    reconcileLevels();
    const after = dataset(),
      current = rankings(after);
    const listChange = describeListChanges(before.levels, after.levels);
    let levelChangeId: number | null = null;
    if (listChange) {
      const changeId = logChange(
        "level",
        listChange.entityId,
        listChange.title,
        null,
        { movements: listChange.movements },
        actorId,
      );
      levelChangeId = changeId;
      const insert = db().prepare(
        "INSERT INTO levelHistory(levelId,fromRank,toRank,fromTier,toTier,changeId,note) VALUES (?,?,?,?,?,?,?)",
      );
      for (const movement of listChange.movements)
        insert.run(
          movement.levelId,
          movement.fromRank,
          movement.toRank,
          movement.fromTier,
          movement.toTier,
          changeId,
          movement.note,
        );
    }
    for (const type of ["players", "districts"] as const) {
      const oldRows = new Map(previous[type].map((p) => [p.id, p]));
      const rows = current[type];
      const rankOf = (row: (typeof rows)[number] | undefined) =>
        row?.rank != null && row.top.some((result) => result.kind !== "empty")
          ? row.rank
          : null;
      const movements = [
        ...rows,
        ...previous[type]
          .filter((row) => !rows.some((next) => next.id === row.id))
          .map((row) => ({ ...row, rank: null })),
      ].flatMap((row) => {
        const old = oldRows.get(row.id);
        const fromRank = rankOf(old),
          toRank = rankOf(row);
        if (fromRank === toRank) return [];
        const primary =
          achievements(before, type, row.id) !==
            achievements(after, type, row.id) ||
          old?.name !== row.name ||
          (type === "players" &&
            before.players.find((player) => player.id === row.id)?.hidden !==
              after.players.find((player) => player.id === row.id)?.hidden);
        return [{ row, old, fromRank, toRank, primary }];
      });
      if (!movements.length) continue;
      if (!levelChangeId && !movements.some((movement) => movement.primary))
        movements[0]!.primary = true;
      const parents = new Map<number, number>();
      for (const movement of movements.filter((item) => item.primary)) {
        const { row, old, fromRank, toRank } = movement;
        const subject =
          type === "districts" ? districtSubject(row.name) : row.name;
        let title: string;
        if (toRank === null)
          title = row.top.some((result) => result.kind !== "empty")
            ? `${subject} вышел из рейтинга`
            : `${subject} больше не имеет ${type === "players" ? "результатов" : "прохождений"} в топе-150`;
        else {
          const position = rows.findIndex((item) => item.id === row.id);
          const higher =
            position > 0 && rankOf(rows[position - 1]) !== null
              ? rows[position - 1]!.name
              : null;
          const lower =
            rankOf(rows[position + 1]) !== null
              ? rows[position + 1]?.name
              : null;
          const neighborName = (name: string) =>
            type === "districts" ? districtGenitive(name) : name;
          const movement =
            fromRank !== null
              ? `${toRank < fromRank ? "поднялся" : "опустился"} с ${fromRank} на ${toRank} место`
              : `вошёл в рейтинг на ${toRank} место`;
          title = `${subject} ${movement} с ${row.score.toFixed(2)} очками${lower ? ` выше ${neighborName(lower)}` : ""}${higher ? `${lower ? " и" : ""} ниже ${neighborName(higher)}` : ""}`;
        }
        parents.set(
          row.id,
          logChange(
            type === "players" ? "player-rating" : "district-rating",
            row.id,
            title,
            fromRank !== null && old
              ? { rank: fromRank, score: old.score }
              : null,
            { rank: toRank, score: row.score },
            actorId,
          ),
        );
      }
      for (const movement of movements) {
        const { row, fromRank, toRank } = movement;
        const causes = movements.filter(
          (cause) =>
            cause !== movement &&
            cause.primary &&
            (cause.fromRank !== null &&
              cause.fromRank < (fromRank ?? Infinity)) !==
              (cause.toRank !== null && cause.toRank < (toRank ?? Infinity)),
        );
        const notes = causes.map((cause) => {
          const name =
            type === "districts"
              ? districtSubject(cause.row.name)
              : cause.row.name;
          if (cause.toRank === null)
            return `${name} вышел из рейтинга с позиции выше`;
          if (cause.fromRank === null)
            return `${name} вошёл в рейтинг выше этого ${type === "players" ? "игрока" : "района"}`;
          const up = cause.toRank < cause.fromRank;
          return `${name} ${up ? "поднялся выше" : "опустился ниже"} этого ${type === "players" ? "игрока" : "района"}`;
        });
        const parentIds = new Set(
          causes.map((cause) => parents.get(cause.row.id)!),
        );
        const ownParent = parents.get(row.id);
        if (ownParent) parentIds.add(ownParent);
        if (levelChangeId) parentIds.add(levelChangeId);
        const note =
          notes.join(", ") ||
          (levelChangeId && !ownParent
            ? "Изменился порядок уровней в листе"
            : fromRank === null
              ? "Вошёл в рейтинг"
              : toRank === null
                ? "Вышел из рейтинга"
                : toRank < fromRank
                  ? "Поднялся в рейтинге"
                  : "Опустился в рейтинге");
        const historyId = Number(
          db()
            .prepare(
              "INSERT INTO ratingHistory(entityType,entityId,fromRank,rank,score,results,reason,changeId,note) VALUES (?,?,?,?,?,?,?,?,?)",
            )
            .run(
              type,
              row.id,
              fromRank,
              toRank,
              row.score,
              JSON.stringify(row.top),
              reason,
              ownParent ?? [...parentIds][0] ?? null,
              note,
            ).lastInsertRowid,
        );
        const insertCause = db().prepare(
          "INSERT INTO ratingHistoryCauses(historyId,changeId) VALUES(?,?)",
        );
        for (const parentId of parentIds) insertCause.run(historyId, parentId);
      }
    }
    return result;
  })();
}
