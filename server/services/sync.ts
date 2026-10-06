import { db, all, one, dataset } from "../database";
import { mutate, logChange } from "./changes";
import { prepareRecordDates, refreshRecordDates } from "./record-dates";
import {
  CORE,
  SHEET,
  fetchLevels,
  fetchRecords,
  parseCoreboard,
  parseSheet,
  sourceText,
  sheetTab,
  parseAchievements,
  type SheetEntry,
  type GlobalLevel,
  type GlobalRecord,
  type Threshold,
} from "./sources";
import { normalizedName } from "../../shared/utils/rating";
import type {
  Level,
  Player,
  RecordEntry,
  District,
} from "../../shared/types/domain";

// Coreboard distinguishes these versions in the label; Demonlist uses separate IDs.
const coreAliases: Record<number, string> = {
  3226: "Thinking Space II",
  3351: "Thinking Space II (Legacy)",
  3299: "Sakupen circles (Nick24)",
  1732: "Sakupen Circles",
};
// The spreadsheet places this version between Ouroboros and Visible Ray.
const sheetAliases: Record<string, number> = { "fever dream": 1652 };
const safeVideo = (value?: string | null) =>
  value && /^https?:\/\//i.test(value) ? value : "";

function findSheetLevel(raw: string, levels: Level[]) {
  const spelling: Record<string, string> = {
    "Knight of Thunder": "Knights of Thunder",
    EXPLICT: "EXPLICIT",
  };
  const name = spelling[raw] || raw;
  let matches = levels.filter(
    (l) => l.gdlId !== null && normalizedName(l.name) === normalizedName(name),
  );
  if (sheetAliases[normalizedName(name)])
    matches = matches.filter(
      (l) => l.gdlId === sheetAliases[normalizedName(name)],
    );
  if (matches.length > 1) {
    const exact = matches.filter((l) => l.name === name);
    if (exact.length === 1) matches = exact;
  }
  // The source's progress row refers to the current top-150 Deimos.
  if (matches.length > 1 && normalizedName(name) === "deimos")
    matches = matches.filter((l) => l.globalRank && l.globalRank <= 150);
  return matches.length === 1 ? matches[0] : undefined;
}

export function importAchievements(
  entries: SheetEntry[],
  type: "players" | "districts",
) {
  const levels = all<Level>("SELECT * FROM levels"),
    unmatched: string[] = [];
  let results = 0;
  for (const entry of entries) {
    let entityId: number;
    if (type === "players") {
      db()
        .prepare("INSERT OR IGNORE INTO players(name) VALUES (?)")
        .run(entry.name);
      entityId = one<Player>(
        "SELECT * FROM players WHERE name=?",
        entry.name,
      )!.id;
    } else {
      const region = /\(ЛО\)/i.test(entry.name) ? "lo" : "spb";
      const name = entry.name.replace(/\s*район(?:\s*\(ЛО\))?$/i, "").trim();
      const district = one<District>(
        "SELECT * FROM districts WHERE name=? AND region=?",
        name,
        region,
      );
      if (!district) {
        unmatched.push(entry.name);
        continue;
      }
      entityId = district.id;
    }
    for (const result of entry.results) {
      const level = findSheetLevel(result.name, levels);
      if (!level) {
        unmatched.push(`${entry.name}: ${result.name}`);
        continue;
      }
      if (type === "players")
        db()
          .prepare(
            `INSERT INTO records(playerId,levelId,manualPercent,note) VALUES (?,?,?,?) ON CONFLICT(playerId,levelId) DO NOTHING`,
          )
          .run(
            entityId,
            level.id,
            result.percent,
            "Источник: исходная таблица СПб; " + SHEET,
          );
      else if (result.percent === 100)
        db()
          .prepare(
            "INSERT OR IGNORE INTO districtExtras(districtId,levelId,note) VALUES (?,?,?)",
          )
          .run(
            entityId,
            level.id,
            "Из исходной таблицы районов; персональная привязка не указана",
          );
      results++;
    }
  }
  db()
    .prepare("INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)")
    .run(`${type}SheetImported`, new Date().toISOString());
  logChange(
    "import",
    null,
    `${type === "players" ? "Игроки" : "Районы"}: перенесено ${results} результатов из таблицы`,
    null,
    {
      entries: entries.length,
      results,
      unmatched,
      source: sheetTab(type === "players" ? "Игроки" : "Районы"),
    },
  );
  return unmatched;
}

export function applyGlobal(
  levels: GlobalLevel[],
  thresholds: Threshold[] | null,
) {
  const existing = new Map(
    all<Level>("SELECT * FROM levels WHERE gdlId IS NOT NULL").map((l) => [
      l.gdlId,
      l,
    ]),
  );
  const incoming = new Set(levels.map((l) => l.id));
  const upsert = db().prepare(
    `INSERT INTO levels(gdlId,name,globalRank,creator,video,ingameId,length) VALUES (?,?,?,?,?,?,?) ON CONFLICT(gdlId) DO UPDATE SET name=excluded.name,globalRank=excluded.globalRank,creator=excluded.creator,video=excluded.video,ingameId=excluded.ingameId,length=excluded.length`,
  );
  for (const l of levels)
    upsert.run(
      l.id,
      l.name,
      l.placement,
      l.holder ?? "",
      safeVideo(l.verification_url),
      l.ingame_id ?? null,
      l.length ?? null,
    );
  for (const old of existing.values())
    if (!incoming.has(old.gdlId!))
      db().prepare("UPDATE levels SET globalRank=NULL WHERE id=?").run(old.id);
  if (!thresholds) return;
  const byName = new Map(thresholds.map((t) => [normalizedName(t.name), t]));
  const counts = new Map<string, number>();
  levels
    .filter((l) => l.placement && l.placement <= 150)
    .forEach((l) =>
      counts.set(
        normalizedName(l.name),
        (counts.get(normalizedName(l.name)) ?? 0) + 1,
      ),
    );
  for (const l of all<Level>("SELECT * FROM levels")) {
    const base = normalizedName(l.name);
    const explicit =
      l.thresholdName || (l.gdlId ? coreAliases[l.gdlId] : undefined);
    const threshold = explicit
      ? byName.get(normalizedName(explicit))
      : (byName.get(normalizedName(`${l.name} (${l.creator})`)) ??
        (counts.get(base) === 1 ? byName.get(base) : undefined));
    const old = existing.get(l.gdlId);
    const t =
      l.globalRank && l.globalRank <= 150 ? (threshold?.t ?? null) : null;
    const T =
      l.globalRank && l.globalRank <= 150 ? (threshold?.T ?? null) : null;
    if (
      old &&
      (old.listPercent !== t || old.endPercent !== T) &&
      l.status !== "catalog"
    )
      logChange(
        "threshold",
        l.id,
        `${l.name}: обновлены проценты`,
        { t: old.listPercent, T: old.endPercent },
        { t, T },
      );
    db()
      .prepare(
        "UPDATE levels SET listPercent=?,endPercent=?,thresholdSource=? WHERE id=?",
      )
      .run(t, T, t === null ? null : CORE, l.id);
  }
}

export function mergeRecords(playerId: number, incoming: GlobalRecord[]) {
  const levels = new Map(
    all<Level>("SELECT * FROM levels WHERE gdlId IS NOT NULL").map((l) => [
      l.gdlId,
      l.id,
    ]),
  );
  const best = new Map<number, GlobalRecord>();
  for (const r of incoming) {
    const prior = best.get(r.level.id);
    if (r.status === "accepted" && (!prior || prior.percent < r.percent))
      best.set(r.level.id, r);
  }
  const old = all<RecordEntry>(
    "SELECT * FROM records WHERE playerId=?",
    playerId,
  );
  const seen = new Set<number>();
  for (const record of best.values()) {
    const levelId = levels.get(record.level.id);
    if (!levelId) continue;
    seen.add(levelId);
    const previous = old.find((r) => r.levelId === levelId);
    if (
      previous?.importedPercent &&
      previous.importedPercent > record.percent
    ) {
      if (!previous.missing) {
        db()
          .prepare("UPDATE records SET missing=1,reviewNeeded=1 WHERE id=?")
          .run(previous.id);
        logChange(
          "record-review",
          playerId,
          `${record.level.name}: глобальный результат понижен; прежний сохранён для проверки`,
          { percent: previous.importedPercent },
          { percent: record.percent, playerId, levelId },
        );
      }
      continue;
    }
    db()
      .prepare(
        `INSERT INTO records(playerId,levelId,importedPercent,importedId,importedVideo) VALUES (?,?,?,?,?) ON CONFLICT(playerId,levelId) DO UPDATE SET importedPercent=excluded.importedPercent,importedId=excluded.importedId,importedVideo=excluded.importedVideo,missing=0,reviewNeeded=0,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      )
      .run(
        playerId,
        levelId,
        record.percent,
        record.id,
        safeVideo(record.video_url),
      );
    if (
      !previous ||
      previous.importedPercent !== record.percent ||
      previous.missing
    )
      logChange(
        "record",
        playerId,
        `${record.level.name}: принят рекорд ${record.percent}% из глобала`,
        previous ? { percent: previous.importedPercent } : null,
        { playerId, levelId, percent: record.percent },
      );
  }
  for (const record of old)
    if (record.importedId && !seen.has(record.levelId) && !record.missing) {
      db()
        .prepare("UPDATE records SET missing=1,reviewNeeded=1 WHERE id=?")
        .run(record.id);
      logChange(
        "record-review",
        playerId,
        "Рекорд отсутствует в глобале; сохранён до решения администрации",
        null,
        { playerId, levelId: record.levelId },
      );
    }
}

export function importSheet(names: string[]) {
  const levels = all<Level>("SELECT * FROM levels");
  const missing: string[] = [];
  for (const raw of names) {
    const match = findSheetLevel(raw, levels);
    if (match)
      db()
        .prepare("UPDATE levels SET verifiedLocal=1 WHERE id=?")
        .run(match.id);
    else {
      missing.push(raw);
      db()
        .prepare("INSERT INTO levels(name,verifiedLocal) VALUES (?,1)")
        .run(raw);
    }
  }
  db()
    .prepare(
      "INSERT OR REPLACE INTO settings(key,value) VALUES ('sheetImported',?)",
    )
    .run(new Date().toISOString());
  logChange(
    "import",
    null,
    `Из исходной таблицы добавлено ${names.length} уровней`,
    null,
    { source: SHEET, unmatched: missing },
  );
  return missing;
}

export async function synchronize(actorId: number | null = null) {
  const now = Date.now();
  const acquired = db().transaction(() => {
    const lock = one<{ value: string }>(
      "SELECT value FROM settings WHERE key='syncLock'",
    );
    if (lock && Number(lock.value) > now) return false;
    db()
      .prepare(
        "INSERT OR REPLACE INTO settings(key,value) VALUES ('syncLock',?)",
      )
      .run(String(now + 60 * 60 * 1000));
    return true;
  })();
  if (!acquired) throw new Error("Синхронизация уже выполняется");
  const run = Number(
    db()
      .prepare("INSERT INTO syncRuns(status,startedAt) VALUES (?,?)")
      .run("running", new Date().toISOString()).lastInsertRowid,
  );
  const warnings: string[] = [];
  try {
    const levels = await fetchLevels();
    let thresholds: Threshold[] | null = null;
    try {
      thresholds = parseCoreboard(await sourceText(CORE));
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : String(e));
    }
    let names: string[] | null = null;
    if (!one("SELECT key FROM settings WHERE key='sheetImported'")) {
      try {
        names = parseSheet(await sourceText(SHEET));
      } catch (e) {
        warnings.push(`Таблица: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const records = new Map<number, GlobalRecord[]>();
    const achievementSheets = new Map<"players" | "districts", SheetEntry[]>();
    for (const [type, name] of [
      ["players", "Игроки"],
      ["districts", "Районы"],
    ] as const) {
      if (
        !one("SELECT key FROM settings WHERE key=?", `${type}SheetImported`)
      ) {
        try {
          achievementSheets.set(
            type,
            parseAchievements(await sourceText(sheetTab(name))),
          );
        } catch (e) {
          warnings.push(
            `Лист ${name}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
    for (const p of all<Player>(
      "SELECT * FROM players WHERE gdlId IS NOT NULL",
    )) {
      try {
        records.set(p.id, await fetchRecords(p.gdlId!));
      } catch (e) {
        warnings.push(
          `${p.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const videoDates = await prepareRecordDates(records);
    if (videoDates.deferred)
      warnings.push(
        `Даты ещё ${videoDates.deferred} видео будут обработаны при следующем обновлении`,
      );
    if (videoDates.unavailable)
      warnings.push(
        `Не удалось получить даты ${videoDates.unavailable} видео; можно указать их вручную`,
      );
    const summary = mutate("Синхронизация источников", actorId, () => {
      applyGlobal(levels, thresholds);
      if (names) {
        const missing = importSheet(names);
        if (missing.length)
          warnings.push(`Не сопоставлены: ${missing.join(", ")}`);
      }
      for (const [type, entries] of achievementSheets) {
        const missing = importAchievements(entries, type);
        if (missing.length)
          warnings.push(`Не сопоставлены ${type}: ${missing.join(", ")}`);
      }
      for (const [playerId, values] of records) mergeRecords(playerId, values);
      refreshRecordDates(videoDates.dates, actorId);
      if (thresholds)
        db()
          .prepare(
            "INSERT OR REPLACE INTO settings(key,value) VALUES ('coreUpdatedAt',?)",
          )
          .run(new Date().toISOString());
      db()
        .prepare(
          "INSERT OR REPLACE INTO settings(key,value) VALUES ('globalUpdatedAt',?)",
        )
        .run(new Date().toISOString());
      const missingThresholds = dataset()
        .levels.filter(
          (l) =>
            l.globalRank &&
            l.globalRank <= 150 &&
            (!l.listPercent || !l.endPercent),
        )
        .map((l) => l.name);
      if (missingThresholds.length)
        warnings.push(
          `Нет процентов Coreboard: ${missingThresholds.join(", ")}`,
        );
      return {
        levels: levels.length,
        players: records.size,
        thresholds: thresholds?.length ?? 0,
        warnings,
      };
    });
    db()
      .prepare("UPDATE syncRuns SET status=?,finishedAt=?,summary=? WHERE id=?")
      .run(
        warnings.length ? "partial" : "success",
        new Date().toISOString(),
        JSON.stringify(summary),
        run,
      );
    return summary;
  } catch (e) {
    db()
      .prepare("UPDATE syncRuns SET status=?,finishedAt=?,error=? WHERE id=?")
      .run(
        "failed",
        new Date().toISOString(),
        e instanceof Error ? e.message : String(e),
        run,
      );
    throw e;
  } finally {
    db().prepare("DELETE FROM settings WHERE key='syncLock'").run();
  }
}
