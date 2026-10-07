import type Database from "better-sqlite3";

export function migrateRegionalVictors(connection: Database.Database) {
  connection.transaction(() => {
    const columns = new Set(
      (
        connection.prepare("PRAGMA table_info(records)").all() as {
          name: string;
        }[]
      ).map((column) => column.name),
    );
    for (const column of ["isFirstSpb", "isFirstLo"])
      if (!columns.has(column))
        connection.exec(
          `ALTER TABLE records ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0 CHECK(${column} IN (0,1))`,
        );
  })();
}
