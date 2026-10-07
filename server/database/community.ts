import type Database from "better-sqlite3";

export function migrateCommunity(connection: Database.Database) {
  // Rebuild only the player table: IDs and all foreign-key targets stay intact.
  const schema = connection
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='players'",
    )
    .get() as { sql: string };
  if (/name TEXT NOT NULL COLLATE NOCASE UNIQUE/i.test(schema.sql)) {
    const foreignKeys = connection.pragma("foreign_keys", { simple: true });
    connection.pragma("foreign_keys = OFF");
    try {
      connection.transaction(() => {
        const columns = (
          connection.prepare("PRAGMA table_info(players)").all() as {
            name: string;
          }[]
        )
          .map((c) => `"${c.name}"`)
          .join(",");
        const objects = connection
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND tbl_name='players' AND sql IS NOT NULL ORDER BY type",
          )
          .all() as { sql: string }[];
        connection.exec(
          schema.sql
            .replace(
              /CREATE TABLE (?:"players"|players)/i,
              "CREATE TABLE players_copy",
            )
            .replace(
              /name TEXT NOT NULL COLLATE NOCASE UNIQUE/i,
              "name TEXT NOT NULL COLLATE NOCASE",
            ),
        );
        connection.exec(
          `INSERT INTO players_copy (${columns}) SELECT ${columns} FROM players; DROP TABLE players; ALTER TABLE players_copy RENAME TO players;`,
        );
        for (const object of objects) connection.exec(object.sql);
        if ((connection.pragma("foreign_key_check") as unknown[]).length)
          throw new Error("Player migration broke a foreign key");
      })();
    } finally {
      connection.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
    }
  }
  connection.transaction(() => {
    const additions = {
      players: { hidden: "INTEGER NOT NULL DEFAULT 0", deletedAt: "TEXT" },
      levels: { deletedAt: "TEXT" },
      records: { isFirstRk: "INTEGER NOT NULL DEFAULT 0" },
      districtExtras: { deletedAt: "TEXT" },
      levelHistory: { note: "TEXT NOT NULL DEFAULT ''" },
    };
    for (const [table, fields] of Object.entries(additions)) {
      const columns = new Set(
        (
          connection.prepare(`PRAGMA table_info(${table})`).all() as {
            name: string;
          }[]
        ).map((c) => c.name),
      );
      for (const [name, definition] of Object.entries(fields))
        if (!columns.has(name))
          connection.exec(
            `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`,
          );
    }
    connection.exec("DROP INDEX IF EXISTS account_nickname");
    connection
      .prepare(
        `UPDATE districts SET name=name || ' городской округ'
         WHERE region='lo' AND name IN ('Гатчинский','Сосновоборский')
         AND NOT EXISTS (
           SELECT 1 FROM districts AS existing
           WHERE existing.region=districts.region
             AND existing.name=districts.name || ' городской округ'
         )`,
      )
      .run();
    const cleaned = connection
      .prepare("SELECT value FROM settings WHERE key='mikaCleanupOct7'")
      .get();
    const mika = connection
      .prepare(
        "SELECT globalRank FROM levels WHERE lower(trim(name))='mika' AND globalRank IS NOT NULL LIMIT 1",
      )
      .get() as { globalRank: number } | undefined;
    if (!cleaned && mika) {
      const timestamp = new Date().toISOString();
      connection
        .prepare(
          "UPDATE records SET deletedAt=?, updatedAt=? WHERE deletedAt IS NULL AND levelId IN (SELECT id FROM levels WHERE globalRank>?)",
        )
        .run(timestamp, timestamp, mika.globalRank);
      connection
        .prepare(
          "UPDATE districtExtras SET deletedAt=? WHERE deletedAt IS NULL AND levelId IN (SELECT id FROM levels WHERE globalRank>?)",
        )
        .run(timestamp, mika.globalRank);
      connection
        .prepare("INSERT INTO settings(key,value) VALUES ('mikaCleanupOct7',?)")
        .run(timestamp);
    }
    if (Number(connection.pragma("user_version", { simple: true })) < 5)
      connection.pragma("user_version = 5");
  })();
}
