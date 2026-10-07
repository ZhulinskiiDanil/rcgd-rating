import { db, dataset } from "../database";
import { reconcileList, effectivePercent } from "../../shared/utils/rating";
import type { DataSet } from "../../shared/types/domain";
import { rankings } from "./rankings";
import { describeListChanges } from "./list-events";
import { districtGenitive } from "./district-history";

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
    reconcileLevels();
    const after = dataset(),
      current = rankings(after);
    const listChange = describeListChanges(before.levels, after.levels);
    if (listChange) {
      const changeId = logChange(
        "level",
        listChange.entityId,
        listChange.title,
        null,
        { movements: listChange.movements },
        actorId,
      );
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
      for (const row of current[type]) {
        const old = oldRows.get(row.id);
        if (
          achievements(before, type, row.id) ===
          achievements(after, type, row.id)
        )
          continue;
        const wasRanked =
          old?.rank != null &&
          old.top.some((result) => result.kind !== "empty");
        const isRanked =
          row.rank !== null &&
          row.top.some((result) => result.kind !== "empty");
        if (!wasRanked && !isRanked) continue;
        if (wasRanked === isRanked && (old?.rank ?? null) === row.rank)
          continue;
        const rank = isRanked ? row.rank : null;
        db()
          .prepare(
            "INSERT INTO ratingHistory(entityType,entityId,rank,score,results,reason) VALUES (?,?,?,?,?,?)",
          )
          .run(type, row.id, rank, row.score, JSON.stringify(row.top), reason);
        const rows = current[type];
        let title: string;
        if (!isRanked)
          title = `${row.name} больше не имеет ${type === "players" ? "результатов" : "прохождений"} в топе-150`;
        else {
          const position = rows.findIndex((item) => item.id === row.id);
          const higher =
            position > 0 && rows[position - 1]!.rank !== null
              ? rows[position - 1]!.name
              : null;
          const lower =
            rows[position + 1]?.rank !== null ? rows[position + 1]?.name : null;
          const neighborName = (name: string) =>
            type === "districts" ? districtGenitive(name) : name;
          const movement =
            wasRanked && old?.rank
              ? `${row.rank! < old.rank ? "поднялся" : "опустился"} с ${old.rank} на ${row.rank} место`
              : `вошёл в рейтинг на ${row.rank} место`;
          title = `${row.name} ${movement} с ${row.score.toFixed(2)} очками${lower ? ` выше ${neighborName(lower)}` : ""}${higher ? `${lower ? " и" : ""} ниже ${neighborName(higher)}` : ""}`;
        }
        logChange(
          type === "players" ? "player-rating" : "district-rating",
          row.id,
          title,
          wasRanked && old ? { rank: old.rank, score: old.score } : null,
          { rank, score: row.score },
          actorId,
        );
      }
    }
    return result;
  })();
}
