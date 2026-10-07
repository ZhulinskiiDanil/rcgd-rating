import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveDatabasePath } from "./path";
import { migrateCommunity } from "./community";
import { migrateAccountSecurity } from "./account-security";
import { migrateRegionalVictors } from "./regional-victors";
import { migrateHistoryEditing } from "./history-editing";
import { migrateMikaPurge } from "./mika-purge";
import { migrateHistoryCorrections } from "./history-corrections";
import {
  migrateMedia,
  migrateRecordDates,
  migrateListControls,
} from "./migrations";
import type {
  Account,
  DataSet,
  Level,
  Player,
  District,
  RecordEntry,
  DistrictExtra,
} from "../../shared/types/domain";

let connection: Database.Database | undefined;
export function db() {
  if (connection) return connection;
  const file = resolveDatabasePath();
  mkdirSync(dirname(file), { recursive: true });
  connection = new Database(file);
  try {
    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
    connection.pragma("busy_timeout = 5000");
    connection.exec(`
    CREATE TABLE IF NOT EXISTS districts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL CHECK(region IN ('spb','lo')), UNIQUE(name, region));
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY, login TEXT NOT NULL COLLATE NOCASE UNIQUE, passwordHash TEXT,
      headAdmin INTEGER NOT NULL DEFAULT 0, permissions TEXT NOT NULL DEFAULT '[]', disabled INTEGER NOT NULL DEFAULT 0,
      discordAvatar TEXT, googleAvatar TEXT, createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE IF NOT EXISTS identities (provider TEXT NOT NULL, subject TEXT NOT NULL, accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, PRIMARY KEY(provider, subject), UNIQUE(provider, accountId));
    CREATE TABLE IF NOT EXISTS players (id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, districtId INTEGER REFERENCES districts(id), gdlId INTEGER UNIQUE, bio TEXT NOT NULL DEFAULT '', accountId INTEGER UNIQUE REFERENCES accounts(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS levels (
      id INTEGER PRIMARY KEY, gdlId INTEGER UNIQUE, name TEXT NOT NULL, globalRank INTEGER, localRank INTEGER,
      listPercent REAL, endPercent REAL, thresholdName TEXT, thresholdSource TEXT, verifiedLocal INTEGER NOT NULL DEFAULT 0,
      creator TEXT NOT NULL DEFAULT '', video TEXT NOT NULL DEFAULT '', ingameId INTEGER, length INTEGER,
      status TEXT NOT NULL DEFAULT 'catalog', enteredAt TEXT, exitedAt TEXT, lastMainRank INTEGER, exitReason TEXT);
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY, playerId INTEGER NOT NULL REFERENCES players(id), levelId INTEGER NOT NULL REFERENCES levels(id),
      manualPercent REAL, importedPercent REAL, importedId INTEGER, manualVideo TEXT NOT NULL DEFAULT '', importedVideo TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1, reviewNeeded INTEGER NOT NULL DEFAULT 0, missing INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '', achievedAt TEXT, updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(playerId,levelId));
    CREATE TABLE IF NOT EXISTS districtExtras (id INTEGER PRIMARY KEY, districtId INTEGER NOT NULL REFERENCES districts(id), levelId INTEGER NOT NULL REFERENCES levels(id), note TEXT NOT NULL DEFAULT '', achievedAt TEXT, UNIQUE(districtId,levelId));
    CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, entityId INTEGER, title TEXT NOT NULL, beforeJson TEXT, afterJson TEXT, actorId INTEGER, public INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE IF NOT EXISTS ratingHistory (id INTEGER PRIMARY KEY, entityType TEXT NOT NULL, entityId INTEGER NOT NULL, rank INTEGER NOT NULL, score REAL NOT NULL, results TEXT NOT NULL, reason TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE INDEX IF NOT EXISTS history_entity ON ratingHistory(entityType, entityId, id);
    CREATE TABLE IF NOT EXISTS syncRuns (id INTEGER PRIMARY KEY, status TEXT NOT NULL, startedAt TEXT NOT NULL, finishedAt TEXT, summary TEXT, error TEXT);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rateLimits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
    migrateMedia(connection);
    migrateRecordDates(connection);
    migrateListControls(connection);
    migrateCommunity(connection);
    migrateAccountSecurity(connection);
    migrateRegionalVictors(connection);
    migrateHistoryEditing(connection);
    migrateMikaPurge(connection);
    migrateHistoryCorrections(connection);
    const cities = [
      "Адмиралтейский",
      "Василеостровский",
      "Выборгский",
      "Калининский",
      "Кировский",
      "Колпинский",
      "Красногвардейский",
      "Красносельский",
      "Кронштадтский",
      "Курортный",
      "Московский",
      "Невский",
      "Петроградский",
      "Петродворцовый",
      "Приморский",
      "Пушкинский",
      "Фрунзенский",
      "Центральный",
    ];
    const oblast = [
      "Бокситогорский",
      "Волосовский",
      "Волховский",
      "Всеволожский",
      "Выборгский",
      "Гатчинский муниципальный округ",
      "Кингисеппский",
      "Киришский",
      "Кировский",
      "Лодейнопольский",
      "Ломоносовский",
      "Лужский",
      "Подпорожский",
      "Приозерский",
      "Сланцевский",
      "Тихвинский",
      "Тосненский",
      "Сосновоборский городской округ",
    ];
    const insert = connection.prepare(
      "INSERT OR IGNORE INTO districts(name,region) VALUES (?,?)",
    );
    if (
      !connection
        .prepare("SELECT key FROM settings WHERE key='districtsSeeded'")
        .get()
    )
      connection.transaction(() => {
        cities.forEach((n) => insert.run(n, "spb"));
        oblast.forEach((n) => insert.run(n, "lo"));
        connection!
          .prepare(
            "INSERT INTO settings(key,value) VALUES ('districtsSeeded','1')",
          )
          .run();
      })();
    return connection;
  } catch (cause) {
    const failed = connection;
    connection = undefined;
    failed.close();
    throw cause;
  }
}
export function all<T>(
  sql: string,
  ...params: (string | number | null)[]
): T[] {
  return db()
    .prepare(sql)
    .all(...params) as T[];
}
export function one<T>(
  sql: string,
  ...params: (string | number | null)[]
): T | undefined {
  return db()
    .prepare(sql)
    .get(...params) as T | undefined;
}
export function dataset(): DataSet {
  return {
    levels: all<Level>("SELECT * FROM levels"),
    players: all<Player>("SELECT * FROM players"),
    districts: all<District>("SELECT * FROM districts"),
    records: all<RecordEntry>("SELECT * FROM records"),
    extras: all<DistrictExtra>("SELECT * FROM districtExtras"),
  };
}
export function account(id: number): Account | undefined {
  const row = one<Omit<Account, "permissions"> & { permissions: string }>(
    "SELECT * FROM accounts WHERE id=?",
    id,
  );
  return row ? { ...row, permissions: JSON.parse(row.permissions) } : undefined;
}
