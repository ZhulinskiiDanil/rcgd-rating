import { db, dataset } from "../database";
import { completedLevels } from "../../shared/utils/rating";
import { rankings } from "./rankings";
import type { Level } from "../../shared/types/domain";

export function logChange(
  kind: string,
  entityId: number | null,
  title: string,
  before: unknown = null,
  after: unknown = null,
  actorId: number | null = null,
  isPublic = true,
) {
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
      Number(isPublic),
    );
}

function reconcileLevels() {
  const data = dataset(),
    positions = new Map(completedLevels(data).map((l, i) => [l.id, i + 1]));
  const now = new Date().toISOString();
  const update = db().prepare(
    "UPDATE levels SET localRank=?, status=?, enteredAt=?, exitedAt=?, lastMainRank=?, exitReason=? WHERE id=?",
  );
  for (const l of data.levels) {
    const local = positions.get(l.id) ?? null;
    const status =
      local && local <= 150
        ? "main"
        : l.status === "main" || l.status === "legacy"
          ? "legacy"
          : "catalog";
    const entered =
      status === "main" && l.status !== "main" ? now : l.enteredAt;
    const exited =
      status === "legacy" && l.status !== "legacy" ? now : l.exitedAt;
    const reason =
      status === "legacy"
        ? l.globalRank === null
          ? "Нет в текущем глобальном списке"
          : local === null
            ? "Нет активного подтверждённого прохождения"
            : "Вне местного топа-150"
        : null;
    update.run(
      local,
      status,
      entered,
      status === "main" ? null : exited,
      status === "main" ? local : l.lastMainRank,
      reason,
      l.id,
    );
  }
}
const levelState = (l: Level) => ({
  name: l.name,
  globalRank: l.globalRank,
  localRank: l.localRank,
  status: l.status,
});

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
    const oldLevels = new Map(before.levels.map((l) => [l.id, l]));
    for (const level of after.levels) {
      const old = oldLevels.get(level.id);
      if (level.status === "catalog" && (!old || old.status === "catalog"))
        continue;
      if (
        !old ||
        JSON.stringify(levelState(level)) !== JSON.stringify(levelState(old))
      ) {
        const title =
          level.status === "legacy" && old?.status !== "legacy"
            ? `${level.name}: переход в legacy`
            : `${level.name}: ${old?.localRank ? "#" + old.localRank : "—"} → ${level.localRank ? "#" + level.localRank : "—"}`;
        logChange(
          "level",
          level.id,
          title,
          old ? levelState(old) : null,
          levelState(level),
          actorId,
        );
      }
    }
    for (const type of ["players", "districts"] as const) {
      const oldRows = new Map(previous[type].map((p) => [p.id, p]));
      for (const row of current[type]) {
        const old = oldRows.get(row.id);
        if (
          old &&
          old.rank === row.rank &&
          Math.abs(old.score - row.score) < 1e-9 &&
          JSON.stringify(old.top) === JSON.stringify(row.top)
        )
          continue;
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
        logChange(
          type === "players" ? "player-rating" : "district-rating",
          row.id,
          `${row.name}: ${old ? old.score.toFixed(3) : "—"} → ${row.score.toFixed(3)}`,
          old ? { rank: old.rank, score: old.score } : null,
          { rank: row.rank, score: row.score },
          actorId,
        );
      }
    }
    return result;
  })();
}
