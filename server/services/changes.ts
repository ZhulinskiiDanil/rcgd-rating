import { db, dataset } from "../database";
import { reconcileList } from "../../shared/utils/rating";
import { rankings } from "./rankings";
import { describeListChanges } from "./list-events";

const publicKinds = new Set(["level", "player-rating", "district-rating"]);

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
        "INSERT INTO levelHistory(levelId,fromRank,toRank,fromTier,toTier,changeId) VALUES (?,?,?,?,?,?)",
      );
      for (const movement of listChange.movements)
        insert.run(
          movement.levelId,
          movement.fromRank,
          movement.toRank,
          movement.fromTier,
          movement.toTier,
          changeId,
        );
    }
    for (const type of ["players", "districts"] as const) {
      const oldRows = new Map(previous[type].map((p) => [p.id, p]));
      for (const row of current[type]) {
        const old = oldRows.get(row.id);
        if ((old?.rank ?? null) === row.rank) continue;
        db()
          .prepare(
            "INSERT INTO ratingHistory(entityType,entityId,rank,score,results,reason) VALUES (?,?,?,?,?,?)",
          )
          .run(
            type,
            row.id,
            row.rank,
            row.score,
            JSON.stringify(row.top),
            reason,
          );
        const rows = current[type];
        let title: string;
        if (row.rank === null)
          title = `«${row.name}» больше не имеет прохождений в топе-150`;
        else {
          const position = rows.findIndex((item) => item.id === row.id);
          const higher =
            position > 0 && rows[position - 1]!.rank !== null
              ? rows[position - 1]!.name
              : null;
          const lower =
            rows[position + 1]?.rank !== null ? rows[position + 1]?.name : null;
          const movement = old?.rank
            ? `${row.rank < old.rank ? "поднялся" : "опустился"} с ${old.rank} на ${row.rank} место`
            : `вошёл в рейтинг на ${row.rank} место`;
          title = `«${row.name}» ${movement} с ${row.score.toFixed(2)} очками${lower ? ` выше «${lower}»` : ""}${higher ? `${lower ? " и" : ""} ниже «${higher}»` : ""}`;
        }
        logChange(
          type === "players" ? "player-rating" : "district-rating",
          row.id,
          title,
          old ? { rank: old.rank, score: old.score } : null,
          { rank: row.rank, score: row.score },
          actorId,
        );
      }
    }
    return result;
  })();
}
