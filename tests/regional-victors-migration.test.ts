import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { migrateRegionalVictors } from "../server/database/regional-victors";

it("adds regional marks without changing existing records and preserves marks on restart", () => {
  const connection = new Database(":memory:");
  try {
    connection.exec(
      "CREATE TABLE records(id INTEGER PRIMARY KEY, playerId INTEGER, levelId INTEGER, manualPercent REAL, manualVideo TEXT, isFirstRk INTEGER); INSERT INTO records VALUES(42,12,7,100,'https://example.com/completion',1)",
    );
    migrateRegionalVictors(connection);
    expect(connection.prepare("SELECT * FROM records").get()).toEqual({
      id: 42,
      playerId: 12,
      levelId: 7,
      manualPercent: 100,
      manualVideo: "https://example.com/completion",
      isFirstRk: 1,
      isFirstSpb: 0,
      isFirstLo: 0,
    });
    connection.exec("UPDATE records SET isFirstSpb=1 WHERE id=42");
    migrateRegionalVictors(connection);
    expect(
      connection.prepare("SELECT isFirstSpb,isFirstLo FROM records").get(),
    ).toEqual({ isFirstSpb: 1, isFirstLo: 0 });
  } finally {
    connection.close();
  }
});
