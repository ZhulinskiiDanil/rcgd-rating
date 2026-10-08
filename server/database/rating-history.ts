import type Database from "better-sqlite3";
import {
  formatHistoryText,
  readStoredMovements,
} from "../services/list-events";
import { formatDistrictHistory } from "../services/district-history";

const migrationKey = "ratingHistoryExpansion20261009";

export function migrateRatingHistory(connection: Database.Database) {
  connection.transaction(() => {
    const columns = new Set(
      (
        connection.prepare("PRAGMA table_info(ratingHistory)").all() as {
          name: string;
        }[]
      ).map((column) => column.name),
    );
    for (const [name, definition] of Object.entries({
      changeId: "INTEGER",
      fromRank: "INTEGER",
      note: "TEXT NOT NULL DEFAULT ''",
      updatedAt: "TEXT",
      deletedAt: "TEXT",
    })) {
      if (!columns.has(name))
        connection.exec(
          `ALTER TABLE ratingHistory ADD COLUMN ${name} ${definition}`,
        );
    }
    connection.exec(`
      CREATE INDEX IF NOT EXISTS rating_history_change ON ratingHistory(changeId);
      CREATE TABLE IF NOT EXISTS ratingHistoryCauses(historyId INTEGER NOT NULL REFERENCES ratingHistory(id) ON DELETE CASCADE, changeId INTEGER NOT NULL REFERENCES changes(id) ON DELETE CASCADE, PRIMARY KEY(historyId,changeId));
      CREATE INDEX IF NOT EXISTS rating_history_cause ON ratingHistoryCauses(changeId);
    `);
    if (
      connection.prepare("SELECT 1 FROM settings WHERE key=?").get(migrationKey)
    )
      return;
    const districtNames = (
      connection.prepare("SELECT name FROM districts").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    const names = (
      connection
        .prepare(
          "SELECT name FROM levels UNION SELECT name FROM players UNION SELECT name FROM districts",
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
    const events = connection
      .prepare(
        "SELECT id,kind,title,entityId,beforeJson,afterJson,createdAt,deletedAt FROM changes WHERE public=1 AND kind IN ('level','player-rating','district-rating')",
      )
      .all() as {
      id: number;
      kind: string;
      title: string;
      entityId: number | null;
      beforeJson: string | null;
      afterJson: string | null;
      createdAt: string;
      deletedAt: string | null;
    }[];
    const updatedAt = new Date().toISOString();
    const update = connection.prepare(
      "UPDATE changes SET title=?,updatedAt=? WHERE id=?",
    );
    let correctedTitles = 0,
      linked = 0;
    for (const event of events) {
      const formatted = formatHistoryText(event.title, [
        ...names,
        ...readStoredMovements(event.afterJson).map((row) => row.name),
      ]);
      const title =
        event.kind === "district-rating"
          ? formatDistrictHistory(formatted, districtNames)
          : formatted;
      if (title !== event.title) {
        update.run(title, updatedAt, event.id);
        correctedTitles++;
        event.title = title;
      }
    }
    const histories = connection
      .prepare(
        "SELECT id,entityType,entityId,rank,score,createdAt FROM ratingHistory WHERE changeId IS NULL ORDER BY entityType,entityId,id",
      )
      .all() as {
      id: number;
      entityType: string;
      entityId: number;
      rank: number | null;
      score: number;
      createdAt: string;
    }[];
    const previous = new Map<string, number | null>();
    const link = connection.prepare(
      "UPDATE ratingHistory SET changeId=?,fromRank=?,note=? WHERE id=?",
    );
    const cause = connection.prepare(
      "INSERT OR IGNORE INTO ratingHistoryCauses(historyId,changeId) VALUES(?,?)",
    );
    for (const history of histories) {
      const key = `${history.entityType}:${history.entityId}`;
      const matches = events.filter(
        (event) =>
          event.kind ===
            (history.entityType === "players"
              ? "player-rating"
              : "district-rating") &&
          event.entityId === history.entityId &&
          matchingResult(event.afterJson, history.rank, history.score),
      );
      const candidates = matches.filter(
        (event) =>
          Math.abs(
            Date.parse(event.createdAt) - Date.parse(history.createdAt),
          ) <= 1000,
      );
      const uniqueResult =
        matches.length === 1 &&
        histories.filter(
          (row) =>
            row.entityType === history.entityType &&
            row.entityId === history.entityId &&
            row.rank === history.rank &&
            row.score === history.score,
        ).length === 1;
      const event =
        candidates.length === 1
          ? candidates[0]!
          : candidates.length === 0 && uniqueResult
            ? matches[0]!
            : null;
      const from = event
        ? readRank(event.beforeJson)
        : (previous.get(key) ?? null);
      link.run(
        event?.id ?? null,
        from,
        event ? formatHistoryText(event.title, names) : "",
        history.id,
      );
      previous.set(key, history.rank);
      if (event) {
        cause.run(history.id, event.id);
        linked++;
      }
    }
    const deleted = connection
      .prepare(
        "DELETE FROM ratingHistory WHERE changeId IN (SELECT id FROM changes WHERE deletedAt IS NOT NULL)",
      )
      .run().changes;
    connection.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(
      migrationKey,
      JSON.stringify({
        linked,
        deleted,
        correctedTitles,
        completedAt: updatedAt,
      }),
    );
  })();
}

function matchingResult(
  json: string | null,
  rank: number | null,
  score: number,
) {
  if (!json) return false;
  try {
    const value = JSON.parse(json);
    return value?.rank === rank && value?.score === score;
  } catch {
    return false;
  }
}

function readRank(json: string | null): number | null {
  if (!json) return null;
  try {
    const rank = JSON.parse(json)?.rank;
    return Number.isSafeInteger(rank) && rank > 0 ? rank : null;
  } catch {
    return null;
  }
}
