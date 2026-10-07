import { describe, expect, it, vi } from "vitest";
import type {
  DataSet,
  Level,
  Player,
  RecordEntry,
} from "../shared/types/domain";
import { reconcileList } from "../shared/utils/rating";
vi.mock("../server/database", () => ({
  all: () => [],
  dataset: () => {
    throw new Error("Explicit test dataset required");
  },
}));
const { rankings } = await import("../server/services/rankings");

function largeCatalog(): DataSet {
  const players: Player[] = Array.from({ length: 61 }, (_, index) => ({
    id: index + 1,
    name: `Player ${index + 1}`,
    districtId: (index % 36) + 1,
    gdlId: index + 1,
    bio: "",
    accountId: null,
    avatarUrl: "",
    inactive: 0,
  }));
  const levels: Level[] = Array.from({ length: 1843 }, (_, index) => ({
    id: index + 1,
    gdlId: index + 1,
    name: index === 1842 ? "Mika" : `Level ${index + 1}`,
    globalRank: index + 1,
    localRank: null,
    listPercent: 50,
    endPercent: 95,
    thresholdName: null,
    thresholdSource: null,
    verifiedLocal: 1,
    creator: "Creator",
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
    gameVersion: "2.2",
    enteredAt: null,
    exitedAt: null,
    lastMainRank: null,
    exitReason: null,
  }));
  const records: RecordEntry[] = players.flatMap((player) =>
    Array.from({ length: 60 }, (_, index) => ({
      id: player.id * 100 + index,
      playerId: player.id,
      levelId: index + player.id,
      manualPercent: index % 5 === 0 ? 90 : 100,
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
      updatedAt: "2026-10-07",
    })),
  );
  const data: DataSet = {
    players,
    levels,
    records,
    extras: [],
    districts: Array.from({ length: 36 }, (_, index) => ({
      id: index + 1,
      name: `District ${index + 1}`,
      region: index < 18 ? "spb" : "lo",
    })),
  };
  return data;
}

describe("rating performance", () => {
  it("reconciles 1843 levels and ranks 61 players / 36 districts without blocking the event loop for seconds", () => {
    const data = largeCatalog();
    const start = performance.now();
    data.levels = reconcileList(data);
    const result = rankings(data);
    const elapsed = performance.now() - start;
    expect(result.players).toHaveLength(61);
    expect(result.districts).toHaveLength(36);
    expect(result.players[0]?.score).toBeGreaterThan(0);
    expect(result.players[0]?.top).toHaveLength(6);
    expect(result.districts.every((district) => district.rank !== null)).toBe(
      true,
    );
    expect(elapsed).toBeLessThan(1000);
  });
});
