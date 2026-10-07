import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { RecordEntry } from "../shared/types/domain";
import { recordEditFields } from "../server/services/record-edit";
import { migrateRegionalVictors } from "../server/database/regional-victors";

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-record-edit-")),
  "test.sqlite",
);
vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
const { db, one } = await import("../server/database");
const { mergeRecords } = await import("../server/services/sync");
const handler = (await import("../server/api/admin/[resource].post"))
  .default as unknown as (event: {
  body: Record<string, unknown>;
}) => Promise<unknown>;

const importedVideo = "https://www.youtube.com/watch?v=22222222222";
const manualVideo = "https://www.youtube.com/watch?v=11111111111";
function original(): RecordEntry {
  return one<RecordEntry>("SELECT * FROM records WHERE id=1")!;
}
function edit(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    playerId: 2,
    levelId: 2,
    manualPercent: 80,
    manualVideo,
    active: true,
    dateSource: "video",
    achievedAt: "2026-09-20",
    discardImported: false,
    ...overrides,
  };
}

beforeEach(() => {
  migrateRegionalVictors(db());
  vi.stubGlobal("getRouterParam", () => "records");
  vi.stubGlobal("requirePermission", async () => ({ id: 1 }));
  vi.stubGlobal("readBody", async (event: { body: unknown }) => event.body);
  vi.stubGlobal(
    "createError",
    (options: { message?: string; statusCode: number }) =>
      Object.assign(new Error(options.message), options),
  );
  db().exec(
    "DELETE FROM records; DELETE FROM districtExtras; DELETE FROM players; DELETE FROM levels; DELETE FROM levelHistory; DELETE FROM ratingHistory; DELETE FROM changes;",
  );
  db().exec(
    "INSERT INTO players(id,name,gdlId) VALUES(1,'Original',101),(2,'Recipient',102); INSERT INTO levels(id,gdlId,name,globalRank) VALUES(1,11,'Original level',1),(2,12,'Recipient level',2);",
  );
  db()
    .prepare(
      `INSERT INTO records(id,playerId,levelId,manualPercent,importedPercent,importedId,manualVideo,importedVideo,achievedAt,dateSource,sourceVideo,updatedAt)
    VALUES(1,1,1,80,100,901,?,?,'2026-09-20','video',?,'2026-09-21')`,
    )
    .run(manualVideo, importedVideo, importedVideo);
  db().exec(
    "UPDATE players SET districtId=(SELECT id FROM districts WHERE region='spb' LIMIT 1) WHERE id=1; UPDATE players SET districtId=(SELECT id FROM districts WHERE region='lo' LIMIT 1) WHERE id=2",
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => db().close());

describe("record reassignment", () => {
  it("persists a manual regional mark and keeps it when global sync updates the record", async () => {
    await handler({
      body: edit({
        playerId: 1,
        levelId: 1,
        isFirstSpb: true,
        isFirstRk: true,
        dateSource: "manual",
      }),
    });
    expect(original()).toMatchObject({
      isFirstSpb: 1,
      isFirstLo: 0,
      isFirstRk: 1,
    });
    mergeRecords(1, [
      {
        id: 901,
        level: { id: 11, name: "Original level" },
        percent: 100,
        status: "accepted",
        video_url: importedVideo,
      },
    ]);
    expect(original()).toMatchObject({
      isFirstSpb: 1,
      isFirstLo: 0,
      isFirstRk: 1,
    });
  });
  it("clears the old region mark when moving to another region and accepts that region's own mark", async () => {
    db().exec("UPDATE records SET isFirstSpb=1 WHERE id=1");
    await handler({ body: edit({ isFirstSpb: true, dateSource: "manual" }) });
    expect(original()).toMatchObject({
      playerId: 2,
      isFirstSpb: 0,
      isFirstLo: 0,
    });
    await handler({
      body: edit({ manualPercent: 100, isFirstLo: true, dateSource: "manual" }),
    });
    expect(original()).toMatchObject({ isFirstSpb: 0, isFirstLo: 1 });
  });
  it("rejects a first-victor mark on a progress record", async () => {
    await expect(
      handler({
        body: edit({
          playerId: 1,
          levelId: 1,
          manualPercent: 95,
          discardImported: true,
          isFirstSpb: true,
          dateSource: "manual",
        }),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(original()).toMatchObject({ isFirstSpb: 0, importedPercent: 100 });
  });
  it("keeps the winning video and date, and blocks reimport on the original player/level pair", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await handler({ body: edit() });
    expect(original()).toMatchObject({
      playerId: 2,
      levelId: 2,
      manualPercent: 100,
      manualVideo: importedVideo,
      importedPercent: null,
      importedId: null,
      importedVideo: "",
      dateSource: "video",
      achievedAt: "2026-09-20",
      sourceVideo: importedVideo,
    });
    expect(fetcher).not.toHaveBeenCalled();
    const tombstone = one<RecordEntry>(
      "SELECT * FROM records WHERE playerId=1 AND levelId=1",
    )!;
    expect(tombstone.id).not.toBe(1);
    expect(tombstone).toMatchObject({
      active: 0,
      manualPercent: 80,
      manualVideo,
      importedPercent: 100,
      importedVideo,
      sourceVideo: importedVideo,
      achievedAt: "2026-09-20",
    });
    expect(tombstone.deletedAt).not.toBeNull();
    mergeRecords(1, [
      {
        id: 901,
        level: { id: 11, name: "Original level" },
        percent: 100,
        status: "accepted",
        video_url: importedVideo,
      },
    ]);
    expect(
      one<RecordEntry>("SELECT * FROM records WHERE playerId=1 AND levelId=1"),
    ).toEqual(tombstone);
    expect(
      one<{ count: number }>("SELECT COUNT(*) AS count FROM records")?.count,
    ).toBe(2);
  });

  it("discards the imported result before choosing the new percentage, video and publication date", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response('<meta itemprop="datePublished" content="2026-08-15">'),
    );
    vi.stubGlobal("fetch", fetcher);
    await handler({ body: edit({ discardImported: true }) });
    expect(original()).toMatchObject({
      manualPercent: 80,
      manualVideo,
      importedPercent: null,
      importedId: null,
      importedVideo: "",
      dateSource: "video",
      achievedAt: "2026-08-15",
      sourceVideo: manualVideo,
    });
    expect(fetcher).toHaveBeenCalledWith(manualVideo, expect.anything());
    expect(
      one<RecordEntry>("SELECT * FROM records WHERE playerId=1 AND levelId=1")
        ?.deletedAt,
    ).not.toBeNull();
  });

  it("does not invent a manual result when discarding an imported-only record", async () => {
    await expect(
      handler({
        body: edit({
          discardImported: true,
          manualPercent: null,
          manualVideo: "",
        }),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(original()).toMatchObject({
      playerId: 1,
      levelId: 1,
      importedPercent: 100,
    });
    expect(
      one<{ count: number }>("SELECT COUNT(*) AS count FROM records")?.count,
    ).toBe(1);
  });

  it("preserves a manually supplied date when the winning video changes", async () => {
    await handler({
      body: edit({ dateSource: "manual", achievedAt: "2026-07-01" }),
    });
    expect(original()).toMatchObject({
      manualVideo: importedVideo,
      manualPercent: 100,
      dateSource: "manual",
      achievedAt: "2026-07-01",
      sourceVideo: "",
    });
  });

  it("never attaches a lower result's video to a higher manual result without video", () => {
    const fields = recordEditFields(
      {
        playerId: 2,
        levelId: 2,
        manualPercent: 100,
        manualVideo: "",
        discardImported: false,
      },
      { ...original(), importedPercent: 80 },
    );
    expect(fields).toMatchObject({
      manualPercent: 100,
      manualVideo: "",
      importedPercent: null,
    });
  });

  it.each(["date", "delete"])(
    "rejects a concurrent %s change while waiting for video metadata",
    async (operation) => {
      let entered!: () => void, release!: (response: Response) => void;
      const lookupStarted = new Promise<void>((resolve) => {
        entered = resolve;
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          entered();
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }),
      );
      const pending = handler({
        body: edit({
          discardImported: true,
          manualVideo: `https://www.youtube.com/watch?v=${operation === "date" ? "33333333333" : "44444444444"}`,
        }),
      });
      await lookupStarted;
      if (operation === "date")
        db().exec(
          "UPDATE records SET achievedAt='2026-05-01',dateSource='manual',sourceVideo='' WHERE id=1",
        );
      else
        db().exec(
          "UPDATE records SET active=0,deletedAt='2026-10-07',updatedAt='2026-10-07' WHERE id=1",
        );
      const concurrent = original();
      release(
        new Response('<meta itemprop="datePublished" content="2026-08-01">'),
      );
      await expect(pending).rejects.toMatchObject({ statusCode: 409 });
      expect(original()).toEqual(concurrent);
      expect(
        one<{ count: number }>("SELECT COUNT(*) AS count FROM records")?.count,
      ).toBe(1);
    },
  );
});
