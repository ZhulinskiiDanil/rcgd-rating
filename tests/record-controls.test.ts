import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBelowMikaVideos,
  deleteRecordPermanently,
  migrateRecordControls,
  refreshRegionalVictorFlags,
} from "../server/database/record-controls";
import type { RecordEntry } from "../shared/types/domain";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-record-controls-")),
  "test.sqlite",
);
vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
const { db, one, all } = await import("../server/database");
const { mergeRecords } = await import("../server/services/sync");
const { mutate } = await import("../server/services/changes");
const editRecord = (await import("../server/api/admin/[resource].post"))
  .default as unknown as (event: {
  body: Record<string, unknown>;
}) => Promise<unknown>;
const removeRecord = (await import("../server/api/admin/records/[id].delete"))
  .default as unknown as (event: {
  id: string;
  query: Record<string, string>;
}) => Promise<unknown>;
let spb: number, lo: number;
beforeEach(() => {
  migrateRecordControls(db());
  db().exec(
    "DELETE FROM deletedRecordImports; DELETE FROM records; DELETE FROM districtExtras; DELETE FROM players; DELETE FROM levels; DELETE FROM changes; DELETE FROM levelHistory; DELETE FROM ratingHistory; DELETE FROM settings WHERE key IN ('mikaGlobalCutoff','recordControls20261009')",
  );
  spb = one<{ id: number }>(
    "SELECT id FROM districts WHERE region='spb' LIMIT 1",
  )!.id;
  lo = one<{ id: number }>(
    "SELECT id FROM districts WHERE region='lo' LIMIT 1",
  )!.id;
  db()
    .prepare(
      "INSERT INTO players(id,name,districtId) VALUES(1,'Earlier',?),(2,'Later',?),(3,'Region LO',?),(4,'No date',?)",
    )
    .run(spb, spb, lo, spb);
  db().exec(
    "INSERT INTO levels(id,gdlId,name,globalRank) VALUES(1,11,'Test level',1),(2,12,'Mika',100),(3,13,'Below Mika',101)",
  );
  vi.stubGlobal("getRouterParam", (event: { id?: string }, name: string) =>
    name === "resource" ? "records" : event.id,
  );
  vi.stubGlobal("getQuery", (event: { query: unknown }) => event.query);
  vi.stubGlobal("readBody", async (event: { body: unknown }) => event.body);
  vi.stubGlobal("requirePermission", async () => ({ id: 9 }));
  vi.stubGlobal(
    "createError",
    (options: { message?: string; statusCode: number }) =>
      Object.assign(new Error(options.message), options),
  );
});
afterAll(() => db().close());
const record = (
  id: number,
  playerId: number,
  date: string | null,
  isFirstSpb = 0,
) =>
  db()
    .prepare(
      "INSERT INTO records(id,playerId,levelId,manualPercent,achievedAt,isFirstSpb) VALUES(?,?,1,100,?,?)",
    )
    .run(id, playerId, date, isFirstSpb);
const get = (id: number) =>
  one<RecordEntry>("SELECT * FROM records WHERE id=?", id)!;

describe("automatic regional first victors", () => {
  it("replaces the old first mark after an earlier completion, date edit, region change and deletion", () => {
    record(1, 2, "2026-02-01");
    mutate("First record", 9, () => {});
    expect(get(1).isFirstSpb).toBe(1);
    mutate("Earlier record", 9, () => record(2, 1, "2026-01-01"));
    expect([get(1).isFirstSpb, get(2).isFirstSpb]).toEqual([0, 1]);
    mutate("Correct date", 9, () =>
      db().exec("UPDATE records SET achievedAt='2025-12-01' WHERE id=1"),
    );
    expect([get(1).isFirstSpb, get(2).isFirstSpb]).toEqual([1, 0]);
    mutate("Move region", 9, () =>
      db().prepare("UPDATE players SET districtId=? WHERE id=2").run(lo),
    );
    expect([get(1).isFirstSpb, get(1).isFirstLo, get(2).isFirstSpb]).toEqual([
      0, 1, 1,
    ]);
    mutate("Delete", 9, () =>
      db().exec(
        "UPDATE records SET deletedAt='2026-10-09',active=0 WHERE id=2",
      ),
    );
    expect(get(2).isFirstSpb).toBe(0);
  });
  it("does not preserve stale ordinary manual marks; equal earliest dates both qualify", () => {
    record(1, 1, "2026-01-01");
    record(2, 2, "2026-02-01", 1);
    refreshRegionalVictorFlags(db());
    expect([get(1).isFirstSpb, get(2).isFirstSpb]).toEqual([1, 0]);
    db().exec("UPDATE records SET achievedAt='2026-01-01' WHERE id=2");
    refreshRegionalVictorFlags(db());
    expect([get(1).isFirstSpb, get(2).isFirstSpb]).toEqual([1, 1]);
  });
  it("excludes verifiers by default and preserves an explicit first-victor exception", async () => {
    record(1, 1, "2026-01-01");
    record(2, 2, "2026-02-01");
    await editRecord({
      body: {
        id: 1,
        playerId: 1,
        levelId: 1,
        manualPercent: 100,
        active: true,
        isVerifier: true,
        dateSource: "manual",
      },
    });
    expect(get(1)).toMatchObject({
      isVerifier: 1,
      firstVictorOverride: 0,
      isFirstSpb: 0,
    });
    expect(get(2).isFirstSpb).toBe(1);
    await editRecord({
      body: {
        id: 1,
        playerId: 1,
        levelId: 1,
        manualPercent: 100,
        active: true,
        isVerifier: true,
        isFirstSpb: true,
        dateSource: "manual",
      },
    });
    expect(get(1)).toMatchObject({
      isVerifier: 1,
      firstVictorOverride: 1,
      isFirstSpb: 1,
    });
    expect(get(2).isFirstSpb).toBe(0);
    refreshRegionalVictorFlags(db());
    expect(get(1).isFirstSpb).toBe(1);
  });
  it("does not invent an order among undated completions", () => {
    record(1, 1, null);
    record(2, 2, null);
    refreshRegionalVictorFlags(db());
    expect([get(1).isFirstSpb, get(2).isFirstSpb]).toEqual([0, 0]);
  });
});

describe("record cleanup and permanent deletion", () => {
  it("migrates only marks and below-Mika video fields, keeping dates, scores and remaining content", () => {
    record(1, 1, "2026-01-01");
    db().exec(
      "UPDATE levels SET verificationPlayerId=1 WHERE id=1; UPDATE levels SET video='https://example.com/verification',showcaseVideo='https://example.com/showcase',previewImage='https://example.com/image'; INSERT INTO records(id,playerId,levelId,importedPercent,importedVideo,manualVideo,sourceVideo,achievedAt,dateSource,reviewNeeded,missing,note) VALUES(2,2,3,100,'https://example.com/imported','https://example.com/manual','https://example.com/imported','2026-01-02','video',1,1,'preserve note')",
    );
    const original = get(2);
    migrateRecordControls(db());
    expect(get(2)).toMatchObject({
      ...original,
      importedVideo: "",
      manualVideo: "",
      sourceVideo: "",
      dateSource: "manual",
      reviewNeeded: 0,
      missing: 0,
      isFirstSpb: 1,
    });
    expect(get(1)).toMatchObject({ isVerifier: 1, isFirstSpb: 0 });
    expect(
      one("SELECT video,showcaseVideo,previewImage FROM levels WHERE id=3"),
    ).toEqual({
      video: "",
      showcaseVideo: "",
      previewImage: "https://example.com/image",
    });
    expect(
      one<{ video: string }>("SELECT video FROM levels WHERE id=2")!.video,
    ).toBe("https://example.com/verification");
    const rows = all("SELECT * FROM records");
    migrateRecordControls(db());
    expect(all("SELECT * FROM records")).toEqual(rows);
    db().exec("UPDATE levels SET video='https://example.com/new' WHERE id=3");
    clearBelowMikaVideos(db());
    expect(
      one<{ video: string }>("SELECT video FROM levels WHERE id=3")!.video,
    ).toBe("");
  });
  it("deletes record data permanently, prevents reimport and retains other records", () => {
    record(1, 1, "2026-01-01");
    record(2, 2, "2026-02-01");
    expect(deleteRecordPermanently(db(), 1)).toBe(true);
    expect(get(1)).toBeUndefined();
    expect(get(2)).toBeDefined();
    mergeRecords(1, [
      {
        id: 777,
        level: { id: 11, name: "Test level" },
        percent: 100,
        status: "accepted",
        video_url: "https://example.com/no-resurrection",
      },
    ]);
    expect(one("SELECT * FROM records WHERE playerId=1")).toBeUndefined();
    expect(deleteRecordPermanently(db(), 1)).toBe(false);
  });
  it("supports permanent deletion of an already soft-deleted record and checks permissions", async () => {
    record(1, 1, "2026-01-01");
    db().exec("UPDATE records SET deletedAt='2026-10-09',active=0 WHERE id=1");
    const access = vi.fn(async () => ({ id: 9 }));
    vi.stubGlobal("requirePermission", access);
    await removeRecord({ id: "1", query: { permanent: "true" } });
    expect(access).toHaveBeenCalledWith(expect.anything(), "records:write");
    expect(get(1)).toBeUndefined();
    record(2, 2, "2026-01-02");
    vi.stubGlobal(
      "requirePermission",
      vi.fn(async () => {
        throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
      }),
    );
    await expect(
      removeRecord({ id: "2", query: { permanent: "true" } }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(get(2)).toBeDefined();
  });
});
