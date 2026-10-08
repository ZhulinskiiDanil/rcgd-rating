import { db, all, one, dataset } from "../database";
import { mutate, logChange } from "./changes";
import { prepareRecordDates, refreshRecordDates } from "./record-dates";
import { gameVersionBatch } from "./level-versions";
import {
  clearBelowMikaVideos,
  refreshRegionalVictorFlags,
} from "../database/record-controls";
import {
  CORE,
  SHEET,
  fetchLevels,
  fetchGameVersion,
  assertGlobalSnapshotSize,
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
import {
  normalizedName,
  reconcileList,
  withinListBoundary,
} from "../../shared/utils/rating";
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

function globalCutoff(levels: GlobalLevel[], stored: Level[]): number | null {
  return (
    levels.find(
      (level) =>
        normalizedName(level.name) === "mika" && level.placement !== null,
    )?.placement ??
    stored.find(
      (level) =>
        normalizedName(level.name) === "mika" && level.globalRank !== null,
    )?.globalRank ??
    (Number(
      one<{ value: string }>(
        "SELECT value FROM settings WHERE key='mikaGlobalCutoff'",
      )?.value,
    ) ||
      null)
  );
}

function permittedGlobalLevels(
  levels: GlobalLevel[],
  stored: Level[],
  cutoff: number | null,
): GlobalLevel[] {
  const existing = new Set(stored.map((level) => level.gdlId));
  return levels.filter(
    (level) =>
      existing.has(level.id) ||
      cutoff === null ||
      (level.placement !== null && level.placement <= cutoff),
  );
}

export function preserveImportedRecordsOnRebind(
  playerId: number,
  previousGdlId: number | null,
) {
  const update = db().prepare(
    `UPDATE records SET manualPercent=?,manualVideo=?,importedPercent=NULL,importedId=NULL,importedVideo='',missing=0,reviewNeeded=0,note=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
  );
  for (const record of all<RecordEntry>(
    "SELECT * FROM records WHERE playerId=? AND importedPercent IS NOT NULL",
    playerId,
  )) {
    const importedWins = record.importedPercent! > (record.manualPercent ?? 0);
    const equalFallback =
      record.importedPercent === record.manualPercent && !record.manualVideo;
    const provenance = `Сохранено при смене Global Demonlist: игрок ${previousGdlId ?? "не указан"}, рекорд ${record.importedId ?? "не указан"}, ${record.importedPercent}%, ${record.importedVideo || "без видео"}`;
    const manualProvenance =
      importedWins && record.manualPercent !== null
        ? `Прежний ручной результат: ${record.manualPercent}%, ${record.manualVideo || "без видео"}`
        : "";
    update.run(
      Math.max(record.manualPercent ?? 0, record.importedPercent!),
      importedWins || equalFallback ? record.importedVideo : record.manualVideo,
      [record.note, provenance, manualProvenance].filter(Boolean).join("\n"),
      record.id,
    );
  }
}

function sheetLevelName(raw: string) {
  const spelling: Record<string, string> = {
    "Knight of Thunder": "Knights of Thunder",
    EXPLICT: "EXPLICIT",
  };
  return spelling[raw] || raw;
}

function findSheetLevel(raw: string, levels: Level[]) {
  const name = sheetLevelName(raw);
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
      const matches = all<Player>(
        "SELECT * FROM players WHERE name=?",
        entry.name,
      );
      if (matches.length > 1 || matches[0]?.deletedAt) {
        unmatched.push(entry.name);
        continue;
      }
      entityId =
        matches[0]?.id ??
        Number(
          db()
            .prepare("INSERT INTO players(name,hidden) VALUES (?,1)")
            .run(entry.name).lastInsertRowid,
        );
    } else {
      const region = /\(ЛО\)/i.test(entry.name) ? "lo" : "spb";
      const name = entry.name.replace(/\s*район(?:\s*\(ЛО\))?$/i, "").trim();
      const districtName =
        region === "lo" &&
        ["Гатчинский", "Гатчинский городской округ"].includes(name)
          ? "Гатчинский муниципальный округ"
          : region === "lo" && name === "Сосновоборский"
            ? "Сосновоборский городской округ"
            : name;
      const district = one<District>(
        "SELECT * FROM districts WHERE name=? AND region=?",
        districtName,
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
      if (level.status === "legacy" || level.deletedAt || level.listExcluded)
        continue;
      if (!withinListBoundary(level, levels)) continue;
      if (type === "players")
        db()
          .prepare(
            `INSERT INTO records(playerId,levelId,manualPercent,note) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM deletedRecordImports WHERE playerId=? AND levelId=?) ON CONFLICT(playerId,levelId) DO NOTHING`,
          )
          .run(
            entityId,
            level.id,
            result.percent,
            "Источник: исходная таблица СПб; " + SHEET,
            entityId,
            level.id,
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
  const stored = all<Level>("SELECT * FROM levels");
  const cutoff = globalCutoff(levels, stored);
  const existing = new Map(
    all<Level>("SELECT * FROM levels WHERE gdlId IS NOT NULL").map((l) => [
      l.gdlId,
      l,
    ]),
  );
  const incoming = new Set(levels.map((l) => l.id));
  const unlinked = all<Level>("SELECT * FROM levels WHERE gdlId IS NULL");
  const matched = new Set<number>();
  for (const level of levels) {
    if (existing.has(level.id)) continue;
    const idMatches = level.ingame_id
      ? unlinked.filter(
          (local) =>
            !matched.has(local.id) && local.ingameId === level.ingame_id,
        )
      : [];
    let match =
      idMatches.length === 1 &&
      levels.filter((item) => item.ingame_id === level.ingame_id).length === 1
        ? idMatches[0]
        : undefined;
    if (!match && !idMatches.length) {
      const nameMatches = unlinked.filter(
        (local) =>
          !matched.has(local.id) &&
          normalizedName(local.name) === normalizedName(level.name) &&
          !(
            local.ingameId &&
            level.ingame_id &&
            local.ingameId !== level.ingame_id
          ),
      );
      if (
        nameMatches.length === 1 &&
        levels.filter(
          (item) => normalizedName(item.name) === normalizedName(level.name),
        ).length === 1
      )
        match = nameMatches[0];
    }
    if (match) {
      db()
        .prepare("UPDATE levels SET gdlId=?,manualPosition=NULL WHERE id=?")
        .run(level.id, match.id);
      matched.add(match.id);
      existing.set(level.id, { ...match, gdlId: level.id });
      logChange(
        "global-link",
        match.id,
        `${match.name}: уровень сопоставлен с Global Demonlist`,
        null,
        { gdlId: level.id },
        null,
        false,
      );
    }
  }
  const upsert = db().prepare(
    `INSERT INTO levels(gdlId,name,globalRank,creator,video,ingameId,length,gameVersion) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(gdlId) DO UPDATE SET name=excluded.name,globalRank=excluded.globalRank,creator=excluded.creator,video=excluded.video,ingameId=excluded.ingameId,length=COALESCE(excluded.length,levels.length),gameVersion=CASE WHEN levels.gameVersion='' THEN excluded.gameVersion ELSE levels.gameVersion END`,
  );
  for (const l of permittedGlobalLevels(levels, [...existing.values()], cutoff))
    upsert.run(
      l.id,
      l.name,
      l.placement,
      l.holder ?? "",
      cutoff !== null && l.placement !== null && l.placement > cutoff
        ? ""
        : safeVideo(l.verification_url),
      l.ingame_id ?? null,
      l.length ?? null,
      l.game_version == null ? "" : String(l.game_version),
    );
  if (cutoff !== null)
    db()
      .prepare(
        "INSERT OR REPLACE INTO settings(key,value) VALUES('mikaGlobalCutoff',?)",
      )
      .run(String(cutoff));
  for (const old of existing.values())
    if (!incoming.has(old.gdlId!))
      db().prepare("UPDATE levels SET globalRank=NULL WHERE id=?").run(old.id);
  clearBelowMikaVideos(db());
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
    if (l.thresholdSource === "manual" || l.deletedAt || l.listExcluded)
      continue;
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
  if (!one("SELECT id FROM players WHERE id=? AND deletedAt IS NULL", playerId))
    return;
  const resolvedLevels = new Map(
    reconcileList(dataset()).map((level) => [level.id, level]),
  );
  const levels = new Map(
    all<Level>(
      "SELECT * FROM levels WHERE gdlId IS NOT NULL AND deletedAt IS NULL AND listExcluded=0",
    ).map((l) => [l.gdlId, l.id]),
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
  const deletedImports = new Set(
    all<{ levelId: number }>(
      "SELECT levelId FROM deletedRecordImports WHERE playerId=?",
      playerId,
    ).map((row) => row.levelId),
  );
  for (const record of best.values()) {
    const levelId = levels.get(record.level.id);
    if (!levelId || deletedImports.has(levelId)) continue;
    const previous = old.find((r) => r.levelId === levelId);
    const resolved = resolvedLevels.get(levelId);
    if (previous?.deletedAt || resolved?.status === "legacy") continue;
    if (
      !previous &&
      resolved &&
      !withinListBoundary(resolved, [...resolvedLevels.values()])
    )
      continue;
    if (
      previous?.importedPercent &&
      previous.importedPercent > record.percent
    ) {
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
  clearBelowMikaVideos(db());
  refreshRegionalVictorFlags(db());
}

export function importSheet(names: string[], incoming: GlobalLevel[] = []) {
  const levels = all<Level>("SELECT * FROM levels");
  const cutoff = globalCutoff(incoming, levels);
  const excludedNames = new Set(
    incoming
      .filter(
        (level) =>
          cutoff !== null &&
          level.placement !== null &&
          level.placement > cutoff,
      )
      .map((level) => normalizedName(level.name)),
  );
  const missing: string[] = [];
  for (const raw of names) {
    const match = findSheetLevel(raw, levels);
    if (match && !match.deletedAt && !match.listExcluded)
      db()
        .prepare("UPDATE levels SET verifiedLocal=1 WHERE id=?")
        .run(match.id);
    else if (
      !match &&
      !excludedNames.has(normalizedName(sheetLevelName(raw)))
    ) {
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
    const previousCount = one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM levels WHERE gdlId IS NOT NULL AND globalRank IS NOT NULL",
    )!.count;
    assertGlobalSnapshotSize(previousCount, levels.length);
    const versionCursor = one<{ value: string }>(
      "SELECT value FROM settings WHERE key='gameVersionCursor'",
    );
    const stored = all<Level>("SELECT * FROM levels");
    const {
      batch: versionBatch,
      nextCursor,
      missingCount,
    } = gameVersionBatch(
      permittedGlobalLevels(levels, stored, globalCutoff(levels, stored)),
      stored,
      Number(versionCursor?.value) || null,
    );
    let versionIndex = 0;
    let versionFailures = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, versionBatch.length) }, async () => {
        while (versionIndex < versionBatch.length) {
          const level = versionBatch[versionIndex++]!;
          try {
            level.game_version = await fetchGameVersion(level.id);
          } catch {
            versionFailures++;
          }
        }
      }),
    );
    if (nextCursor !== null)
      db()
        .prepare(
          "INSERT OR REPLACE INTO settings(key,value) VALUES ('gameVersionCursor',?)",
        )
        .run(String(nextCursor));
    if (versionFailures)
      warnings.push(
        `Не удалось загрузить версии ${versionFailures} уровней; сохранённые значения не изменены`,
      );
    if (missingCount > versionBatch.length)
      warnings.push(
        `Версии ещё ${missingCount - versionBatch.length} уровней будут загружены при следующих обновлениях`,
      );
    const globalRanks = new Set(levels.map((level) => level.placement));
    const missingRanks = Array.from({ length: 150 }, (_, i) => i + 1).filter(
      (rank) => !globalRanks.has(rank),
    );
    if (missingRanks.length)
      warnings.push(
        `В глобальном источнике отсутствуют позиции: ${missingRanks.join(", ")}; опубликованные позиции сохранены без перенумерации`,
      );
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
    const recordSources = new Map<number, number>();
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
      "SELECT * FROM players WHERE gdlId IS NOT NULL AND deletedAt IS NULL",
    )) {
      try {
        records.set(p.id, await fetchRecords(p.gdlId!));
        recordSources.set(p.id, p.gdlId!);
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
        const missing = importSheet(names, levels);
        if (missing.length)
          warnings.push(`Не сопоставлены: ${missing.join(", ")}`);
      }
      for (const [type, entries] of achievementSheets) {
        const missing = importAchievements(entries, type);
        if (missing.length)
          warnings.push(`Не сопоставлены ${type}: ${missing.join(", ")}`);
      }
      for (const [playerId, values] of records) {
        const current = one<Player>(
          "SELECT * FROM players WHERE id=?",
          playerId,
        );
        if (
          current &&
          !current.deletedAt &&
          current.gdlId === recordSources.get(playerId)
        )
          mergeRecords(playerId, values);
      }
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
