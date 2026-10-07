import type Database from "better-sqlite3";

export function migrateAccountSecurity(connection: Database.Database) {
  connection.transaction(() => {
    const columns = new Set(
      (
        connection.prepare("PRAGMA table_info(accounts)").all() as {
          name: string;
        }[]
      ).map((column) => column.name),
    );
    for (const [name, definition] of Object.entries({
      sessionKey: "TEXT NOT NULL DEFAULT ''",
      avatarLocked: "INTEGER NOT NULL DEFAULT 0",
      passwordResetRequired: "INTEGER NOT NULL DEFAULT 0",
    })) {
      if (!columns.has(name))
        connection.exec(
          `ALTER TABLE accounts ADD COLUMN ${name} ${definition}`,
        );
    }
    connection.exec(`
      UPDATE accounts SET sessionKey=lower(hex(randomblob(32))) WHERE sessionKey='';
      CREATE TRIGGER IF NOT EXISTS accounts_session_key_insert
      AFTER INSERT ON accounts WHEN NEW.sessionKey=''
      BEGIN
        UPDATE accounts SET sessionKey=lower(hex(randomblob(32))) WHERE id=NEW.id;
      END;
    `);
  })();
}
