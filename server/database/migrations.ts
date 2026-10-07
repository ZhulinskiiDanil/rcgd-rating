import type Database from "better-sqlite3";

export function migrateMedia(connection: Database.Database) {
  connection.transaction(() => {
    const additions = {
      accounts: { avatarUrl: "TEXT NOT NULL DEFAULT ''" },
      players: { avatarUrl: "TEXT NOT NULL DEFAULT ''" },
      levels: {
        previewImage: "TEXT NOT NULL DEFAULT ''",
        showcaseVideo: "TEXT NOT NULL DEFAULT ''",
        verificationPlayerId:
          "INTEGER REFERENCES players(id) ON DELETE SET NULL",
        verificationRegion: "TEXT CHECK(verificationRegion IN ('spb','lo'))",
        verificationDate: "TEXT",
      },
    };
    for (const [table, fields] of Object.entries(additions)) {
      const columns = new Set(
        (
          connection.prepare(`PRAGMA table_info(${table})`).all() as {
            name: string;
          }[]
        ).map((column) => column.name),
      );
      for (const [column, definition] of Object.entries(fields)) {
        if (!columns.has(column))
          connection.exec(
            `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
          );
      }
    }
    if (Number(connection.pragma("user_version", { simple: true })) < 2)
      connection.pragma("user_version = 2");
  })();
}

export function migrateRecordDates(connection: Database.Database) {
  connection.transaction(() => {
    const columns = new Set(
      (
        connection.prepare("PRAGMA table_info(records)").all() as {
          name: string;
        }[]
      ).map((column) => column.name),
    );
    if (!columns.has("dateSource")) {
      connection.exec(
        "ALTER TABLE records ADD COLUMN dateSource TEXT CHECK(dateSource IN ('manual','video'))",
      );
      connection.exec(
        "UPDATE records SET dateSource='manual' WHERE achievedAt IS NOT NULL",
      );
    }
    if (!columns.has("sourceVideo"))
      connection.exec(
        "ALTER TABLE records ADD COLUMN sourceVideo TEXT NOT NULL DEFAULT ''",
      );
    if (Number(connection.pragma("user_version", { simple: true })) < 3)
      connection.pragma("user_version = 3");
  })();
}

export function migrateListControls(connection: Database.Database) {
  connection.transaction(() => {
    const additions = {
      levels: {
        listExcluded: "INTEGER NOT NULL DEFAULT 0",
        manualPosition: "INTEGER",
        gameVersion: "TEXT NOT NULL DEFAULT ''",
      },
      players: { inactive: "INTEGER NOT NULL DEFAULT 0" },
      records: { deletedAt: "TEXT" },
      accounts: { nickname: "TEXT NOT NULL DEFAULT ''" },
    };
    for (const [table, fields] of Object.entries(additions)) {
      const columns = new Set(
        (
          connection.prepare(`PRAGMA table_info(${table})`).all() as {
            name: string;
          }[]
        ).map((column) => column.name),
      );
      for (const [column, definition] of Object.entries(fields))
        if (!columns.has(column))
          connection.exec(
            `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
          );
    }
    connection.exec("DROP INDEX IF EXISTS account_nickname");
    connection.exec(
      "UPDATE levels SET status='extended' WHERE status='main' AND localRank BETWEEN 76 AND 150",
    );
    connection.exec(
      "UPDATE levels SET localRank=NULL WHERE status IN ('catalog','legacy')",
    );
    connection.exec(
      `CREATE TABLE IF NOT EXISTS levelHistory(id INTEGER PRIMARY KEY, levelId INTEGER NOT NULL, fromRank INTEGER, toRank INTEGER, fromTier TEXT, toTier TEXT, changeId INTEGER, createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))); CREATE INDEX IF NOT EXISTS level_history_entity ON levelHistory(levelId,id)`,
    );
    const rank = (
      connection.prepare("PRAGMA table_info(ratingHistory)").all() as {
        name: string;
        notnull: number;
      }[]
    ).find((column) => column.name === "rank");
    if (rank?.notnull)
      connection.exec(`
      CREATE TABLE ratingHistory_nullable(id INTEGER PRIMARY KEY, entityType TEXT NOT NULL, entityId INTEGER NOT NULL, rank INTEGER, score REAL NOT NULL, results TEXT NOT NULL, reason TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      INSERT INTO ratingHistory_nullable SELECT * FROM ratingHistory;
      DROP TABLE ratingHistory;
      ALTER TABLE ratingHistory_nullable RENAME TO ratingHistory;
      CREATE INDEX history_entity ON ratingHistory(entityType,entityId,id);
    `);
    if (Number(connection.pragma("user_version", { simple: true })) < 4)
      connection.pragma("user_version = 4");
  })();
}
