import type Database from "better-sqlite3";
import type { District, Player, RecordEntry } from "../../shared/types/domain";
import { regionalFirstVictors } from "../../shared/utils/victors";

export function refreshRegionalVictorFlags(connection: Database.Database) {
  const records = connection
    .prepare("SELECT * FROM records")
    .all() as RecordEntry[];
  const data = {
    records: records.map((record) => ({
      ...record,
      isFirstSpb:
        record.isVerifier && record.firstVictorOverride ? record.isFirstSpb : 0,
      isFirstLo:
        record.isVerifier && record.firstVictorOverride ? record.isFirstLo : 0,
    })),
    players: connection.prepare("SELECT * FROM players").all() as Player[],
    districts: connection
      .prepare("SELECT * FROM districts")
      .all() as District[],
  };
  const firstByLevel = new Map(
    [...new Set(records.map((record) => record.levelId))].map((levelId) => [
      levelId,
      new Map(
        regionalFirstVictors(data, levelId).map((row) => [
          row.region,
          new Set(row.victors.map((victor) => victor.playerId)),
        ]),
      ),
    ]),
  );
  const update = connection.prepare(
    "UPDATE records SET isFirstSpb=?,isFirstLo=? WHERE id=?",
  );
  for (const record of records) {
    const eligible =
      record.active &&
      !record.deletedAt &&
      Math.max(record.manualPercent ?? 0, record.importedPercent ?? 0) === 100;
    const first = firstByLevel.get(record.levelId)!;
    const spb = Number(!!eligible && first.get("spb")!.has(record.playerId));
    const lo = Number(!!eligible && first.get("lo")!.has(record.playerId));
    if (spb !== record.isFirstSpb || lo !== record.isFirstLo)
      update.run(spb, lo, record.id);
  }
}

export function clearBelowMikaVideos(connection: Database.Database) {
  const mika = connection
    .prepare(
      "SELECT globalRank FROM levels WHERE lower(trim(name))='mika' AND globalRank IS NOT NULL LIMIT 1",
    )
    .get() as { globalRank: number } | undefined;
  const setting = connection
    .prepare("SELECT value FROM settings WHERE key='mikaGlobalCutoff'")
    .get() as { value: string } | undefined;
  const cutoff = mika?.globalRank ?? (Number(setting?.value) || null);
  if (cutoff === null) return;
  connection
    .prepare(
      "UPDATE levels SET video='',showcaseVideo='' WHERE globalRank>? AND (video!='' OR showcaseVideo!='')",
    )
    .run(cutoff);
  connection
    .prepare(
      `UPDATE records SET manualVideo='',importedVideo='',sourceVideo='',dateSource=CASE WHEN dateSource='video' AND achievedAt IS NOT NULL THEN 'manual' ELSE dateSource END
    WHERE levelId IN (SELECT id FROM levels WHERE globalRank>?) AND (manualVideo!='' OR importedVideo!='' OR sourceVideo!='')`,
    )
    .run(cutoff);
}

export function migrateRecordControls(connection: Database.Database) {
  connection.transaction(() => {
    const columns = new Set(
      (
        connection.prepare("PRAGMA table_info(records)").all() as {
          name: string;
        }[]
      ).map((column) => column.name),
    );
    for (const column of ["isVerifier", "firstVictorOverride"])
      if (!columns.has(column))
        connection.exec(
          `ALTER TABLE records ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0 CHECK(${column} IN (0,1))`,
        );
    connection.exec(`CREATE TABLE IF NOT EXISTS deletedRecordImports (
      playerId INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      levelId INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
      PRIMARY KEY(playerId,levelId)
    )`);
    if (
      !connection
        .prepare("SELECT key FROM settings WHERE key='recordControls20261009'")
        .get()
    ) {
      connection.exec("UPDATE records SET reviewNeeded=0,missing=0");
      connection.exec(`UPDATE records SET isVerifier=1 WHERE MAX(COALESCE(manualPercent,0),COALESCE(importedPercent,0))=100
        AND EXISTS (SELECT 1 FROM levels WHERE levels.id=records.levelId AND levels.verificationPlayerId=records.playerId)`);
      clearBelowMikaVideos(connection);
      refreshRegionalVictorFlags(connection);
      connection
        .prepare(
          "INSERT INTO settings(key,value) VALUES('recordControls20261009',?)",
        )
        .run(new Date().toISOString());
    }
  })();
}

export function deleteRecordPermanently(
  connection: Database.Database,
  id: number,
) {
  const record = connection
    .prepare("SELECT playerId,levelId FROM records WHERE id=?")
    .get(id) as { playerId: number; levelId: number } | undefined;
  if (!record) return false;
  connection.transaction(() => {
    connection
      .prepare(
        "INSERT OR IGNORE INTO deletedRecordImports(playerId,levelId) VALUES(?,?)",
      )
      .run(record.playerId, record.levelId);
    connection.prepare("DELETE FROM records WHERE id=?").run(id);
  })();
  return true;
}
