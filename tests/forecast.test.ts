import { describe, expect, it } from "vitest";
import type {
  DataSet,
  Level,
  Player,
  RecordEntry,
} from "../shared/types/domain";
import { forecastRating } from "../shared/utils/forecast";
import { reconcileList } from "../shared/utils/rating";
const level = (id: number, completed = true): Level => ({
  id,
  gdlId: id,
  name: `Level ${id}`,
  globalRank: id,
  localRank: null,
  listPercent: 50,
  endPercent: 95,
  thresholdName: null,
  thresholdSource: null,
  verifiedLocal: Number(completed),
  creator: "",
  video: "",
  previewImage: "",
  showcaseVideo: "",
  verificationPlayerId: null,
  verificationRegion: null,
  verificationDate: null,
  ingameId: null,
  length: null,
  status: "catalog",
  listExcluded: 0,
  manualPosition: null,
  gameVersion: "",
  enteredAt: null,
  exitedAt: null,
  lastMainRank: null,
  exitReason: null,
});
const player = (id: number): Player => ({
  id,
  name: `Player ${id}`,
  districtId: id,
  gdlId: null,
  bio: "",
  accountId: null,
  avatarUrl: "",
  inactive: 0,
});
const record = (
  playerId: number,
  levelId: number,
  percent = 100,
): RecordEntry => ({
  id: playerId * 1000 + levelId,
  playerId,
  levelId,
  manualPercent: percent,
  importedPercent: null,
  importedId: null,
  manualVideo: "",
  importedVideo: "",
  active: 1,
  reviewNeeded: 0,
  missing: 0,
  note: "",
  achievedAt: null,
  dateSource: null,
  sourceVideo: "",
  deletedAt: null,
  updatedAt: "",
});
function fixture(): DataSet {
  const data: DataSet = {
    levels: Array.from({ length: 151 }, (_, i) => level(i + 1, i !== 0)),
    players: [player(1), player(2)],
    districts: [
      { id: 1, name: "One", region: "spb" },
      { id: 2, name: "Two", region: "lo" },
    ],
    records: [record(2, 2), record(1, 151)],
    extras: [],
  };
  data.levels = reconcileList(data);
  return data;
}
describe("forecast", () => {
  it("ignores stale out-of-list positions from an older catalog", () => {
    const data = fixture();
    data.levels.push({ ...level(200, false), localRank: 180 });
    expect(forecastRating(data, "players", 1, []).changes).toEqual([]);
  });
  it("does not reactivate an old imported completion when planning progress", () => {
    const data = fixture();
    data.records.push({
      ...record(1, 1),
      active: 0,
      manualPercent: null,
      importedPercent: 100,
    });
    const result = forecastRating(data, "players", 1, [
      { levelId: 1, percent: 50 },
    ]);
    expect(result.changes).toEqual([]);
    expect(result.after.top[0]).toMatchObject({
      kind: "progress",
      percent: 50,
      position: 4,
    });
  });
  it("shifts the entire list and retires #150 on a first regional completion without mutating the catalog", () => {
    const data = fixture(),
      snapshot = JSON.stringify(data);
    const result = forecastRating(data, "players", 1, [
      { levelId: 1, percent: 100 },
    ]);
    expect(result.levels.find((l) => l.id === 1)).toMatchObject({
      localRank: 1,
      status: "main",
    });
    expect(result.levels.find((l) => l.id === 2)?.localRank).toBe(2);
    expect(result.levels.find((l) => l.id === 151)?.status).toBe("legacy");
    expect(result.levels.find((l) => l.id === 76)?.status).toBe("extended");
    expect(result.changes).toHaveLength(151);
    expect(result.after.top[0]).toMatchObject({ levelId: 1, position: 1 });
    expect(JSON.stringify(data)).toBe(snapshot);
  });
  it("does not move levels for progress and uses its hypothetical position", () => {
    const result = forecastRating(fixture(), "players", 1, [
      { levelId: 1, percent: 95 },
    ]);
    expect(result.changes).toEqual([]);
    expect(result.after.top[0]).toMatchObject({
      kind: "progress",
      position: 2,
    });
  });
  it("does not move the list for a level already completed in the region", () => {
    const result = forecastRating(fixture(), "players", 1, [
      { levelId: 2, percent: 100 },
    ]);
    expect(result.changes).toEqual([]);
    expect(result.after.top[0]).toMatchObject({ levelId: 2, position: 1 });
  });
  it("deduplicates planned district completions and keeps districts with #150 ranked", () => {
    const data = fixture();
    const empty = forecastRating(data, "districts", 1, []);
    expect(empty.before.rank).not.toBeNull();
    expect(empty.before.score).toBe(150);
    const result = forecastRating(data, "districts", 1, [
      { levelId: 1, percent: 100 },
      { levelId: 1, percent: 100 },
    ]);
    expect(
      result.after.top.filter((r) => r.kind === "completion"),
    ).toHaveLength(1);
    expect(result.after.rank).toBe(1);
    expect(() =>
      forecastRating(data, "districts", 1, [{ levelId: 1, percent: 95 }]),
    ).toThrow();
  });
  it("does not downgrade existing results or accept new Legacy records", () => {
    const data = fixture();
    expect(
      forecastRating(data, "players", 2, [{ levelId: 2, percent: 50 }]).after,
    ).toEqual(forecastRating(data, "players", 2, []).after);
    data.levels[0]!.status = "legacy";
    expect(() =>
      forecastRating(data, "players", 1, [{ levelId: 1, percent: 100 }]),
    ).toThrow("недоступен");
  });
});
