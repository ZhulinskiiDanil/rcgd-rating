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
