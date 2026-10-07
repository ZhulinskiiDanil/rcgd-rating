import type Database from "better-sqlite3";

function renameGatchina(connection: Database.Database) {
  if (
    connection
      .prepare(
        "SELECT id FROM districts WHERE region='lo' AND name='Гатчинский муниципальный округ'",
      )
      .get()
  )
    return;
  const district = connection
    .prepare(
      "SELECT id FROM districts WHERE region='lo' AND name IN ('Гатчинский','Гатчинский городской округ') ORDER BY id LIMIT 1",
    )
    .get() as { id: number } | undefined;
  if (district)
    connection
      .prepare(
        "UPDATE districts SET name='Гатчинский муниципальный округ' WHERE id=?",
      )
      .run(district.id);
}

function pruneLevelChanges(
  connection: Database.Database,
  removed: Set<number>,
) {
  let deleted = 0;
  const changes = connection
    .prepare(
      "SELECT id,kind,entityId,afterJson FROM changes WHERE kind IN ('level','global-link','level-order')",
    )
    .all() as {
    id: number;
    kind: string;
    entityId: number | null;
    afterJson: string | null;
  }[];
  for (const change of changes) {
    let payload: { movements?: { levelId: number }[] } | null = null;
    if (change.kind === "level" && change.afterJson) {
      try {
        payload = JSON.parse(change.afterJson);
      } catch {
        payload = null;
      }
    }
    if (Array.isArray(payload?.movements)) {
      const kept = payload.movements.filter(
        (movement) => !removed.has(movement.levelId),
      );
      if (
        kept.length === payload.movements.length &&
        (change.entityId === null || !removed.has(change.entityId))
      )
        continue;
      if (kept.length) {
        connection
          .prepare("UPDATE changes SET afterJson=?,entityId=? WHERE id=?")
          .run(
            JSON.stringify({ ...payload, movements: kept }),
            change.entityId !== null && removed.has(change.entityId)
              ? null
              : change.entityId,
            change.id,
          );
        continue;
      }
    } else if (change.entityId === null || !removed.has(change.entityId))
      continue;
    deleted += connection
      .prepare("DELETE FROM changes WHERE id=?")
      .run(change.id).changes;
  }
  return deleted;
}

function permanentIds(connection: Database.Database, table: string) {
  const { sql } = connection
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
    .get(table) as { sql: string };
  if (/\bAUTOINCREMENT\b/i.test(sql)) return;
  const primaryKey = /((?:\bid\b|"id")\s+INTEGER\s+PRIMARY\s+KEY)/i;
  if (!primaryKey.test(sql))
    throw new Error(`Cannot preserve IDs while migrating ${table}`);
  const copy = `${table}_permanent_ids`;
  const columns = (
    connection.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[]
  )
    .map((column) => `"${column.name.replaceAll('"', '""')}"`)
    .join(",");
  const objects = connection
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND tbl_name=? AND sql IS NOT NULL ORDER BY type",
    )
    .all(table) as { sql: string }[];
  connection.exec(
    sql
      .replace(
        /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)/i,
        `CREATE TABLE "${copy}"`,
      )
      .replace(primaryKey, "$1 AUTOINCREMENT"),
  );
  connection.exec(
    `INSERT INTO "${copy}" (${columns}) SELECT ${columns} FROM "${table}"; DROP TABLE "${table}"; ALTER TABLE "${copy}" RENAME TO "${table}";`,
  );
  for (const object of objects) connection.exec(object.sql);
}

export function migrateMikaPurge(connection: Database.Database) {
  if (connection.inTransaction)
    throw new Error("Mika migration requires its own transaction");
  const foreignKeys = connection.pragma("foreign_keys", { simple: true });
  connection.pragma("foreign_keys = OFF");
  try {
    connection.transaction(() => {
      for (const table of ["levels", "records", "districtExtras"])
        permanentIds(connection, table);
      renameGatchina(connection);
      if (
        !connection
          .prepare("SELECT value FROM settings WHERE key='mikaPermanentPurge'")
          .get()
      ) {
        const mika = connection
          .prepare(
            "SELECT globalRank FROM levels WHERE lower(trim(name))='mika' AND globalRank IS NOT NULL LIMIT 1",
          )
          .get() as { globalRank: number } | undefined;
        if (mika) {
          const at = new Date().toISOString();
          const removed = new Set(
            (
              connection
                .prepare("SELECT id FROM levels WHERE globalRank>?")
                .all(mika.globalRank) as { id: number }[]
            ).map((level) => level.id),
          );
          const records = connection
            .prepare(
              "DELETE FROM records WHERE levelId IN (SELECT id FROM levels WHERE globalRank>?)",
            )
            .run(mika.globalRank).changes;
          const extras = connection
            .prepare(
              "DELETE FROM districtExtras WHERE levelId IN (SELECT id FROM levels WHERE globalRank>?)",
            )
            .run(mika.globalRank).changes;
          const levelHistory = connection
            .prepare(
              "DELETE FROM levelHistory WHERE levelId IN (SELECT id FROM levels WHERE globalRank>?)",
            )
            .run(mika.globalRank).changes;
          const changes = pruneLevelChanges(connection, removed);
          const levels = connection
            .prepare("DELETE FROM levels WHERE globalRank>?")
            .run(mika.globalRank).changes;
          connection
            .prepare(
              "INSERT INTO settings(key,value) VALUES('mikaPermanentPurge',?)",
            )
            .run(
              JSON.stringify({
                at,
                globalRank: mika.globalRank,
                levels,
                records,
                extras,
                levelHistory,
                changes,
              }),
            );
          connection
            .prepare(
              "INSERT OR REPLACE INTO settings(key,value) VALUES('mikaGlobalCutoff',?)",
            )
            .run(String(mika.globalRank));
        }
      }
      if ((connection.pragma("foreign_key_check") as unknown[]).length)
        throw new Error("Mika migration broke a foreign key");
    })();
  } finally {
    connection.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}
