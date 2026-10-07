import type Database from "better-sqlite3";

export function migrateHistoryEditing(connection: Database.Database) {
  connection.transaction(() => {
    for (const table of ["changes", "levelHistory"]) {
      const columns = new Set(
        (
          connection.prepare(`PRAGMA table_info(${table})`).all() as {
            name: string;
          }[]
        ).map((column) => column.name),
      );
      for (const [name, definition] of Object.entries({
        deletedAt: "TEXT",
        updatedAt: "TEXT",
        ...(table === "levelHistory"
          ? { noteEdited: "INTEGER NOT NULL DEFAULT 0" }
          : {}),
      })) {
        if (!columns.has(name))
          connection.exec(
            `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`,
          );
      }
    }
  })();
}
