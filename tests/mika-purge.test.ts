import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrateMikaPurge } from "../server/database/mika-purge";

const connections: Database.Database[] = [];
afterEach(() =>
  connections.splice(0).forEach((connection) => connection.close()),
);

function fixture() {
  const connection = new Database(":memory:");
  connections.push(connection);
  connection.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE accounts(id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE, passwordHash TEXT, avatarUrl TEXT);
    CREATE TABLE identities(provider TEXT, subject TEXT, accountId INTEGER REFERENCES accounts(id));
    CREATE TABLE districts(id INTEGER PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL, UNIQUE(name,region));
    CREATE TABLE players(id INTEGER PRIMARY KEY, name TEXT, accountId INTEGER REFERENCES accounts(id), districtId INTEGER REFERENCES districts(id));
    CREATE TABLE levels(id INTEGER PRIMARY KEY, gdlId INTEGER UNIQUE, name TEXT NOT NULL, globalRank INTEGER, status TEXT NOT NULL DEFAULT 'catalog', previewImage TEXT DEFAULT '', showcaseVideo TEXT DEFAULT '', verificationPlayerId INTEGER REFERENCES players(id), exitedAt TEXT);
    CREATE INDEX level_rank ON levels(globalRank);
    CREATE TABLE records(id INTEGER PRIMARY KEY, playerId INTEGER NOT NULL REFERENCES players(id), levelId INTEGER NOT NULL REFERENCES levels(id), manualPercent REAL CHECK(manualPercent BETWEEN 0 AND 100), importedPercent REAL, manualVideo TEXT, importedVideo TEXT, achievedAt TEXT, note TEXT, deletedAt TEXT, UNIQUE(playerId,levelId));
    CREATE INDEX record_player ON records(playerId);
    CREATE TABLE districtExtras(id INTEGER PRIMARY KEY, districtId INTEGER NOT NULL REFERENCES districts(id), levelId INTEGER NOT NULL REFERENCES levels(id), note TEXT, achievedAt TEXT, deletedAt TEXT, UNIQUE(districtId,levelId));
    CREATE TABLE levelHistory(id INTEGER PRIMARY KEY, levelId INTEGER REFERENCES levels(id), note TEXT);
    CREATE TABLE changes(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, entityId INTEGER, afterJson TEXT, title TEXT);
    CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE recordAudit(recordId INTEGER, percent REAL);
    CREATE TRIGGER record_edit AFTER UPDATE OF manualPercent ON records BEGIN INSERT INTO recordAudit VALUES(NEW.id, NEW.manualPercent); END;
    INSERT INTO accounts VALUES(12,'OriginalLogin','OriginalHash','/media/avatar.webp');
    INSERT INTO identities VALUES('discord','OriginalSubject',12);
    INSERT INTO districts VALUES(22,'Гатчинский городской округ','lo');
    INSERT INTO players VALUES(32,'Original player',12,22),(33,'Other player',NULL,22);
    INSERT INTO levels VALUES
      (40,140,'Future drop',99,'main','/media/future.webp','https://example.com/future.mp4',32,NULL),
      (41,141,'Mika',100,'extended','/media/mika.webp','https://example.com/mika.mp4',32,NULL),
      (42,142,'Removed current',101,'extended','/media/lower.webp','https://example.com/lower.mp4',33,NULL),
      (43,143,'Removed legacy',102,'legacy','/media/legacy.webp','https://example.com/legacy.mp4',32,'2026-01-01');
    INSERT INTO records VALUES
      (50,32,40,100,NULL,'manual-future','','2026-09-01','Future note',NULL),
      (51,32,41,80,100,'manual-mika','imported-mika','2026-09-02','Mika note',NULL),
      (52,32,42,100,NULL,'manual-lower','','2026-09-03','Lower note','2026-09-04'),
      (53,33,43,NULL,100,'','imported-legacy','2026-09-05','Legacy note',NULL);
    INSERT INTO districtExtras VALUES(60,22,40,'Future extra','2026-09-01',NULL),(61,22,41,'Mika extra','2026-09-02',NULL),(62,22,42,'Lower extra','2026-09-03',NULL),(63,22,43,'Legacy extra','2026-09-05','2026-09-06');
    INSERT INTO levelHistory VALUES(70,41,'Mika history'),(71,42,'Lower history'),(72,43,'Legacy history');
    INSERT INTO changes VALUES
      (80,'level',42,'{"movements":[{"levelId":42,"toRank":12},{"levelId":41,"toRank":13}],"reason":"sync"}','Mixed movement'),
      (81,'global-link',43,'{"gdlId":143}','Removed link'),
      (82,'level-order',42,NULL,'Removed order'),
      (83,'level',43,'{"movements":[{"levelId":43}]}','Only removed movement'),
      (84,'level',42,'{"movements":[{"levelId":41}]}','Surviving movement with stale entity'),
      (85,'admin-edit',12,'{"resource":"accounts"}','Account history'),
      (86,'player-rating',32,'{"score":50}','Player history'),
      (87,'level',41,NULL,'Mika event');
    INSERT INTO settings VALUES('originalSetting','originalValue');
  `);
  return connection;
}

const rows = (connection: Database.Database, table: string) =>
  connection.prepare(`SELECT * FROM ${table} ORDER BY id`).all();

describe("one-time permanent Mika cleanup", () => {
  it("removes below-Mika levels and dependent results without changing users or retained media and metadata", () => {
    const connection = fixture();
    const accounts = rows(connection, "accounts");
    const identities = connection.prepare("SELECT * FROM identities").all();
    const players = rows(connection, "players");
    const levels = rows(connection, "levels").slice(0, 2);
    const records = rows(connection, "records").slice(0, 2);
    const extras = rows(connection, "districtExtras").slice(0, 2);
    migrateMikaPurge(connection);
    expect(rows(connection, "accounts")).toEqual(accounts);
    expect(connection.prepare("SELECT * FROM identities").all()).toEqual(
      identities,
    );
    expect(rows(connection, "players")).toEqual(players);
    expect(rows(connection, "levels")).toEqual(levels);
    expect(rows(connection, "records")).toEqual(records);
    expect(rows(connection, "districtExtras")).toEqual(extras);
    expect(rows(connection, "levelHistory")).toEqual([
      { id: 70, levelId: 41, note: "Mika history" },
    ]);
    expect(connection.prepare("SELECT id,name FROM districts").get()).toEqual({
      id: 22,
      name: "Гатчинский муниципальный округ",
    });
    const marker = connection
      .prepare("SELECT value FROM settings WHERE key='mikaPermanentPurge'")
      .pluck()
      .get() as string;
    expect(JSON.parse(marker)).toMatchObject({
      globalRank: 100,
      levels: 2,
      records: 2,
      extras: 2,
      levelHistory: 2,
      changes: 3,
    });
    expect(connection.pragma("foreign_key_check")).toEqual([]);
    expect(connection.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("keeps mixed historical movements and unrelated account/player history", () => {
    const connection = fixture();
    migrateMikaPurge(connection);
    expect(rows(connection, "changes")).toEqual([
      {
        id: 80,
        kind: "level",
        entityId: null,
        afterJson: '{"movements":[{"levelId":41,"toRank":13}],"reason":"sync"}',
        title: "Mixed movement",
      },
      {
        id: 84,
        kind: "level",
        entityId: null,
        afterJson: '{"movements":[{"levelId":41}]}',
        title: "Surviving movement with stale entity",
      },
      {
        id: 85,
        kind: "admin-edit",
        entityId: 12,
        afterJson: '{"resource":"accounts"}',
        title: "Account history",
      },
      {
        id: 86,
        kind: "player-rating",
        entityId: 32,
        afterJson: '{"score":50}',
        title: "Player history",
      },
      {
        id: 87,
        kind: "level",
        entityId: 41,
        afterJson: null,
        title: "Mika event",
      },
    ]);
  });

  it("never reuses purged IDs and preserves constraints, indexes, triggers and foreign-key targets", () => {
    const connection = fixture();
    migrateMikaPurge(connection);
    const levelId = Number(
      connection.prepare("INSERT INTO levels(name) VALUES('New level')").run()
        .lastInsertRowid,
    );
    const recordId = Number(
      connection
        .prepare(
          "INSERT INTO records(playerId,levelId,manualPercent) VALUES(32,?,100)",
        )
        .run(levelId).lastInsertRowid,
    );
    const extraId = Number(
      connection
        .prepare("INSERT INTO districtExtras(districtId,levelId) VALUES(22,?)")
        .run(levelId).lastInsertRowid,
    );
    expect(levelId).toBeGreaterThan(43);
    expect(recordId).toBeGreaterThan(53);
    expect(extraId).toBeGreaterThan(63);
    connection
      .prepare("UPDATE records SET manualPercent=90 WHERE id=?")
      .run(recordId);
    expect(connection.prepare("SELECT * FROM recordAudit").all()).toEqual([
      { recordId, percent: 90 },
    ]);
    expect(() =>
      connection
        .prepare("INSERT INTO records(playerId,levelId) VALUES(32,?)")
        .run(levelId),
    ).toThrow(/UNIQUE/);
    expect(() =>
      connection
        .prepare("UPDATE records SET manualPercent=101 WHERE id=?")
        .run(recordId),
    ).toThrow(/CHECK/);
    expect(() =>
      connection
        .prepare("INSERT INTO records(playerId,levelId) VALUES(999,?)")
        .run(levelId),
    ).toThrow(/FOREIGN KEY/);
    expect(
      connection
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('level_rank','record_player') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: "level_rank" }, { name: "record_player" }]);
    connection.prepare("DELETE FROM records WHERE id=?").run(recordId);
    connection.prepare("DELETE FROM districtExtras WHERE id=?").run(extraId);
    connection.prepare("DELETE FROM levels WHERE id=?").run(levelId);
    migrateMikaPurge(connection);
    const nextLevelId = Number(
      connection.prepare("INSERT INTO levels(name) VALUES('Next level')").run()
        .lastInsertRowid,
    );
    expect(nextLevelId).toBeGreaterThan(levelId);
    expect(
      Number(
        connection
          .prepare("INSERT INTO records(playerId,levelId) VALUES(32,?)")
          .run(nextLevelId).lastInsertRowid,
      ),
    ).toBeGreaterThan(recordId);
    expect(
      Number(
        connection
          .prepare(
            "INSERT INTO districtExtras(districtId,levelId) VALUES(22,?)",
          )
          .run(nextLevelId).lastInsertRowid,
      ),
    ).toBeGreaterThan(extraId);
  });

  it("does not purge future drops or their records when migration runs again", () => {
    const connection = fixture();
    migrateMikaPurge(connection);
    connection.exec(
      "UPDATE levels SET globalRank=110,status='legacy',exitedAt='2026-10-08' WHERE id=40",
    );
    const before = [
      "levels",
      "records",
      "districtExtras",
      "changes",
      "settings",
    ].map((table) => connection.prepare(`SELECT * FROM ${table}`).all());
    migrateMikaPurge(connection);
    expect(
      ["levels", "records", "districtExtras", "changes", "settings"].map(
        (table) => connection.prepare(`SELECT * FROM ${table}`).all(),
      ),
    ).toEqual(before);
    expect(
      connection.prepare("SELECT exitedAt FROM levels WHERE id=40").get(),
    ).toEqual({ exitedAt: "2026-10-08" });
  });

  it("defers destructive cleanup until Mika has a rank, while safely renaming the district", () => {
    const connection = fixture();
    connection.exec("UPDATE levels SET globalRank=NULL WHERE name='Mika'");
    const before = rows(connection, "levels");
    migrateMikaPurge(connection);
    expect(rows(connection, "levels")).toEqual(before);
    expect(
      connection
        .prepare("SELECT value FROM settings WHERE key='mikaPermanentPurge'")
        .get(),
    ).toBeUndefined();
    expect(
      connection
        .prepare("SELECT name FROM districts WHERE id=22")
        .pluck()
        .get(),
    ).toBe("Гатчинский муниципальный округ");
    connection.exec("UPDATE levels SET globalRank=100 WHERE name='Mika'");
    migrateMikaPurge(connection);
    expect(rows(connection, "levels")).toHaveLength(2);
  });

  it("does not merge or remove districts when the renamed district already exists", () => {
    const connection = fixture();
    connection.exec(
      "INSERT INTO districts VALUES(23,'Гатчинский муниципальный округ','lo')",
    );
    migrateMikaPurge(connection);
    expect(rows(connection, "districts")).toEqual([
      { id: 22, name: "Гатчинский городской округ", region: "lo" },
      { id: 23, name: "Гатчинский муниципальный округ", region: "lo" },
    ]);
    expect(
      connection
        .prepare("SELECT districtId FROM players WHERE id=32")
        .pluck()
        .get(),
    ).toBe(22);
  });

  it("rolls back cleanup and table rebuilding on a foreign-key error and restores enforcement", () => {
    const connection = fixture();
    connection.exec(
      "PRAGMA foreign_keys=OFF; INSERT INTO players VALUES(34,'Broken reference',999,22); PRAGMA foreign_keys=ON;",
    );
    const levels = rows(connection, "levels");
    const records = rows(connection, "records");
    expect(() => migrateMikaPurge(connection)).toThrow(/foreign key/);
    expect(rows(connection, "levels")).toEqual(levels);
    expect(rows(connection, "records")).toEqual(records);
    expect(
      connection
        .prepare("SELECT value FROM settings WHERE key='mikaPermanentPurge'")
        .get(),
    ).toBeUndefined();
    expect(
      connection
        .prepare("SELECT sql FROM sqlite_master WHERE name='levels'")
        .pluck()
        .get(),
    ).not.toContain("AUTOINCREMENT");
    expect(connection.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});
