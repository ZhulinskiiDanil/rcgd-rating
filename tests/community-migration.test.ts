import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrateCommunity } from "../server/database/community";

const connections: Database.Database[] = [];
afterEach(() =>
  connections.splice(0).forEach((connection) => connection.close()),
);

function oldDatabase() {
  const connection = new Database(":memory:");
  connections.push(connection);
  connection.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA user_version=4;
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY, login TEXT NOT NULL COLLATE NOCASE UNIQUE,
      passwordHash TEXT, nickname TEXT NOT NULL DEFAULT '', headAdmin INTEGER NOT NULL DEFAULT 0,
      permissions TEXT NOT NULL DEFAULT '[]', disabled INTEGER NOT NULL DEFAULT 0,
      avatarUrl TEXT NOT NULL DEFAULT '', discordAvatar TEXT, googleAvatar TEXT, createdAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX account_nickname ON accounts(nickname COLLATE NOCASE) WHERE nickname <> '';
    CREATE TABLE identities (
      provider TEXT NOT NULL, subject TEXT NOT NULL,
      accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      PRIMARY KEY(provider,subject), UNIQUE(provider,accountId)
    );
    CREATE TABLE districts (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL, UNIQUE(name,region)
    );
    CREATE TABLE players (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      districtId INTEGER REFERENCES districts(id), gdlId INTEGER UNIQUE,
      bio TEXT NOT NULL DEFAULT '', accountId INTEGER UNIQUE REFERENCES accounts(id) ON DELETE SET NULL,
      avatarUrl TEXT NOT NULL DEFAULT '', inactive INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX player_district ON players(districtId);
    CREATE TABLE playerAudit(playerId INTEGER, newName TEXT);
    CREATE TRIGGER player_rename AFTER UPDATE OF name ON players BEGIN
      INSERT INTO playerAudit VALUES(NEW.id, NEW.name);
    END;
    CREATE TABLE levels (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, globalRank INTEGER, status TEXT NOT NULL,
      previewImage TEXT NOT NULL, showcaseVideo TEXT NOT NULL,
      verificationPlayerId INTEGER REFERENCES players(id) ON DELETE SET NULL
    );
    CREATE TABLE records (
      id INTEGER PRIMARY KEY, playerId INTEGER NOT NULL REFERENCES players(id),
      levelId INTEGER NOT NULL REFERENCES levels(id), manualPercent REAL, importedPercent REAL,
      manualVideo TEXT NOT NULL, importedVideo TEXT NOT NULL, achievedAt TEXT,
      dateSource TEXT, sourceVideo TEXT NOT NULL, note TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, deletedAt TEXT, updatedAt TEXT NOT NULL,
      UNIQUE(playerId,levelId)
    );
    CREATE TABLE districtExtras (
      id INTEGER PRIMARY KEY, districtId INTEGER NOT NULL REFERENCES districts(id),
      levelId INTEGER NOT NULL REFERENCES levels(id), note TEXT NOT NULL, achievedAt TEXT,
      UNIQUE(districtId,levelId)
    );
    CREATE TABLE levelHistory (
      id INTEGER PRIMARY KEY, levelId INTEGER NOT NULL, fromRank INTEGER, toRank INTEGER,
      fromTier TEXT, toTier TEXT, changeId INTEGER, createdAt TEXT NOT NULL
    );
    CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO accounts VALUES
      (21,'OriginalLogin','retained-password-hash','Original nick',1,'["records:write"]',0,'/media/account.webp','https://cdn.discordapp.com/original.png',NULL,'2026-09-01'),
      (22,'OtherLogin','other-password-hash','Other nick',0,'[]',0,'https://example.com/avatar.jpg',NULL,NULL,'2026-09-02');
    INSERT INTO identities VALUES('discord','discord-subject-1',21),('google','google-subject-2',22);
    INSERT INTO districts VALUES(11,'Гатчинский','lo'),(12,'Сосновоборский','lo');
    INSERT INTO players VALUES
      (31,'Original player',11,310,'My original bio',21,'/media/player.webp',1),
      (32,'Other player',12,320,'Another bio',22,'https://example.com/player.jpg',0);
    INSERT INTO levels VALUES
      (41,'Mika',100,'extended','/media/mika.jpg','https://youtu.be/dQw4w9WgXcQ',31),
      (42,'Lower level',101,'extended','/media/lower.jpg','https://example.com/lower.mp4',32),
      (43,'Future drop',99,'main','/media/future.jpg','https://example.com/future.mp4',31);
    INSERT INTO records VALUES
      (51,31,41,100,NULL,'https://example.com/manual.mp4','','2026-09-10','manual','https://example.com/manual.mp4','Retain this note',1,NULL,'2026-09-11'),
      (52,31,42,80,100,'https://example.com/progress.mp4','https://example.com/imported.mp4','2026-09-12','video','https://example.com/imported.mp4','Lower record',1,NULL,'2026-09-13'),
      (53,32,42,100,NULL,'https://example.com/removed.mp4','','2026-09-14','manual','https://example.com/removed.mp4','Already removed',1,'2026-09-15','2026-09-15'),
      (54,32,43,100,NULL,'https://example.com/future-record.mp4','','2026-09-16','manual','https://example.com/future-record.mp4','Future record',1,NULL,'2026-09-17');
    INSERT INTO districtExtras VALUES(61,11,41,'Original extra','2026-09-10'),(62,12,42,'Lower extra','2026-09-12'),(63,12,43,'Future extra','2026-09-16');
    INSERT INTO levelHistory VALUES(71,41,80,81,'extended','extended',81,'2026-09-20');
    INSERT INTO settings VALUES('originalSetting','unchanged');
  `);
  return connection;
}

function rows(connection: Database.Database, table: string) {
  return connection.prepare(`SELECT * FROM ${table}`).all() as Record<
    string,
    unknown
  >[];
}

function without(row: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !keys.includes(key)),
  );
}

describe("community migration preserves existing data", () => {
  it("retains both district IDs if the canonical name was already added manually", () => {
    const connection = oldDatabase();
    connection.exec(
      "INSERT INTO districts VALUES(13,'Гатчинский городской округ','lo')",
    );
    expect(() => migrateCommunity(connection)).not.toThrow();
    expect(
      connection
        .prepare(
          "SELECT id,name FROM districts WHERE id IN (11,13) ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: 11, name: "Гатчинский" },
      { id: 13, name: "Гатчинский городской округ" },
    ]);
    expect(
      connection.prepare("SELECT districtId FROM players WHERE id=31").get(),
    ).toEqual({ districtId: 11 });
    expect(
      connection
        .prepare("SELECT districtId FROM districtExtras WHERE id=61")
        .get(),
    ).toEqual({ districtId: 11 });
    expect(connection.pragma("foreign_key_check")).toEqual([]);
  });
  it("retains accounts, identities, player IDs, links, media and achievement metadata", () => {
    const connection = oldDatabase();
    const before = Object.fromEntries(
      [
        "accounts",
        "identities",
        "players",
        "levels",
        "records",
        "districtExtras",
        "levelHistory",
      ].map((table) => [table, rows(connection, table)]),
    );
    migrateCommunity(connection);
    expect(rows(connection, "accounts")).toEqual(before.accounts);
    expect(rows(connection, "identities")).toEqual(before.identities);
    expect(
      rows(connection, "players").map((row) =>
        without(row, ["hidden", "deletedAt"]),
      ),
    ).toEqual(before.players);
    expect(
      rows(connection, "levels").map((row) => without(row, ["deletedAt"])),
    ).toEqual(before.levels);
    expect(
      rows(connection, "records").map((row) =>
        without(row, ["isFirstRk", "deletedAt", "updatedAt"]),
      ),
    ).toEqual(
      before.records!.map((row) => without(row, ["deletedAt", "updatedAt"])),
    );
    expect(
      rows(connection, "districtExtras").map((row) =>
        without(row, ["deletedAt"]),
      ),
    ).toEqual(before.districtExtras);
    expect(
      rows(connection, "levelHistory").map((row) => without(row, ["note"])),
    ).toEqual(before.levelHistory);
    expect(connection.pragma("foreign_key_check")).toEqual([]);
    expect(connection.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(connection.pragma("user_version", { simple: true })).toBe(5);
    expect(
      connection
        .prepare(
          "SELECT accountId, gdlId, hidden, deletedAt FROM players WHERE id=31",
        )
        .get(),
    ).toEqual({ accountId: 21, gdlId: 310, hidden: 0, deletedAt: null });
    expect(rows(connection, "districts").map((row) => row.name)).toEqual([
      "Гатчинский городской округ",
      "Сосновоборский городской округ",
    ]);
    expect(
      connection
        .prepare("SELECT sql FROM sqlite_master WHERE name='player_district'")
        .get(),
    ).toBeTruthy();
    connection.exec("UPDATE players SET name='Renamed' WHERE id=31");
    expect(rows(connection, "playerAudit")).toEqual([
      { playerId: 31, newName: "Renamed" },
    ]);
  });

  it("allows duplicate player names and account nicknames while keeping unique logins and links", () => {
    const connection = oldDatabase();
    migrateCommunity(connection);
    connection.exec(
      "UPDATE players SET name='Original player' WHERE id=32; UPDATE accounts SET nickname='Original nick' WHERE id=22;",
    );
    expect(rows(connection, "players").map((row) => row.name)).toEqual([
      "Original player",
      "Original player",
    ]);
    expect(rows(connection, "accounts").map((row) => row.nickname)).toEqual([
      "Original nick",
      "Original nick",
    ]);
    expect(() =>
      connection.exec("UPDATE accounts SET login='originallogin' WHERE id=22"),
    ).toThrow(/UNIQUE/);
    expect(() =>
      connection.exec("UPDATE players SET accountId=21 WHERE id=32"),
    ).toThrow(/UNIQUE/);
    expect(() =>
      connection.exec("UPDATE players SET gdlId=310 WHERE id=32"),
    ).toThrow(/UNIQUE/);
    expect(() =>
      connection.exec(
        "INSERT INTO records(id,playerId,levelId,manualVideo,importedVideo,sourceVideo,note,updatedAt) VALUES(90,999,41,'','','','','2026-10-07')",
      ),
    ).toThrow(/FOREIGN KEY/);
  });

  it("cleans below-Mika records once with tombstones, preserving future drops and manual changes", () => {
    const connection = oldDatabase();
    migrateCommunity(connection);
    const tombstone = connection
      .prepare("SELECT deletedAt, updatedAt FROM records WHERE id=52")
      .get() as { deletedAt: string; updatedAt: string };
    expect(tombstone.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(tombstone.updatedAt).toBe(tombstone.deletedAt);
    expect(
      connection
        .prepare("SELECT deletedAt FROM districtExtras WHERE id=62")
        .get(),
    ).toEqual({ deletedAt: tombstone.deletedAt });
    expect(
      connection
        .prepare("SELECT deletedAt,updatedAt FROM records WHERE id=53")
        .get(),
    ).toEqual({ deletedAt: "2026-09-15", updatedAt: "2026-09-15" });
    expect(
      connection
        .prepare("SELECT deletedAt,updatedAt FROM records WHERE id=51")
        .get(),
    ).toEqual({ deletedAt: null, updatedAt: "2026-09-11" });
    connection.exec(
      "UPDATE levels SET globalRank=102,status='legacy' WHERE id=43; UPDATE players SET hidden=1 WHERE id=31; UPDATE records SET isFirstRk=1 WHERE id=51; UPDATE levels SET previewImage='/media/edited.jpg' WHERE id=41;",
    );
    const snapshot = Object.fromEntries(
      [
        "accounts",
        "identities",
        "players",
        "levels",
        "records",
        "districtExtras",
        "levelHistory",
        "settings",
        "districts",
      ].map((table) => [table, rows(connection, table)]),
    );
    migrateCommunity(connection);
    for (const [table, entries] of Object.entries(snapshot))
      expect(rows(connection, table)).toEqual(entries);
    expect(
      connection.prepare("SELECT deletedAt FROM records WHERE id=54").get(),
    ).toEqual({ deletedAt: null });
    expect(
      connection
        .prepare("SELECT deletedAt FROM districtExtras WHERE id=63")
        .get(),
    ).toEqual({ deletedAt: null });
    expect(connection.pragma("foreign_key_check")).toEqual([]);
  });

  it("waits for a known Mika boundary without deleting data or prematurely marking cleanup complete", () => {
    const connection = oldDatabase();
    connection.exec("UPDATE levels SET globalRank=NULL WHERE name='Mika'");
    migrateCommunity(connection);
    expect(
      connection
        .prepare("SELECT value FROM settings WHERE key='mikaCleanupOct7'")
        .get(),
    ).toBeUndefined();
    expect(
      connection.prepare("SELECT deletedAt FROM records WHERE id=52").get(),
    ).toEqual({ deletedAt: null });
    connection.exec("UPDATE levels SET globalRank=100 WHERE name='Mika'");
    migrateCommunity(connection);
    expect(
      connection
        .prepare("SELECT value FROM settings WHERE key='mikaCleanupOct7'")
        .get(),
    ).toBeTruthy();
    expect(
      (
        connection
          .prepare("SELECT deletedAt FROM records WHERE id=52")
          .get() as { deletedAt: string | null }
      ).deletedAt,
    ).not.toBeNull();
  });

  it("rolls back a failed table rebuild and restores foreign-key enforcement", () => {
    const connection = oldDatabase();
    connection.pragma("foreign_keys = OFF");
    connection.exec("UPDATE records SET playerId=999 WHERE id=51");
    connection.pragma("foreign_keys = ON");
    const players = rows(connection, "players"),
      accounts = rows(connection, "accounts");
    expect(() => migrateCommunity(connection)).toThrow("foreign key");
    expect(rows(connection, "players")).toEqual(players);
    expect(rows(connection, "accounts")).toEqual(accounts);
    expect(
      connection
        .prepare("SELECT name FROM sqlite_master WHERE name='players_copy'")
        .get(),
    ).toBeUndefined();
    expect(() =>
      connection.exec("UPDATE players SET name='Original player' WHERE id=32"),
    ).toThrow(/UNIQUE/);
    expect(connection.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});
