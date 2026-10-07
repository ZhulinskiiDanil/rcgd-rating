import { describe, expect, it, vi } from "vitest";
import type {
  DataSet,
  Level,
  RankedPlayer,
  RecordEntry,
} from "../shared/types/domain";
import { playerNeighbors } from "../shared/utils/player-navigation";
import { rankings } from "../server/services/rankings";

vi.mock("../server/database", () => ({
  all: () => [],
  dataset: () => {
    throw new Error("A fixture must be supplied");
  },
}));

const player = (id: number, rank: number | null): RankedPlayer => ({
  id,
  name: `Player ${id}`,
  rank,
  score: rank ?? 150,
  top: [],
  districtId: 1,
  districtName: "Район",
  gdlId: null,
  bio: "",
  accountId: null,
  avatarUrl: "",
  avatar: null,
  inactive: 0,
});

function level(
  id: number,
  status: Level["status"],
  localRank: number | null,
): Level {
  return {
    id,
    name: `Level ${id}`,
    status,
    localRank,
    globalRank: id,
    gdlId: id,
    listPercent: 50,
    endPercent: 100,
    thresholdName: null,
    thresholdSource: null,
    verifiedLocal: 0,
    creator: "",
    video: "",
    previewImage: "",
    showcaseVideo: "",
    verificationPlayerId: null,
    verificationRegion: null,
    verificationDate: null,
    ingameId: null,
    length: null,
    listExcluded: 0,
    manualPosition: null,
    gameVersion: "",
    enteredAt: null,
    exitedAt: null,
    lastMainRank: null,
    exitReason: null,
  };
}

const record = (id: number, levelId: number, playerId = 1): RecordEntry => ({
  id,
  levelId,
  playerId,
  manualPercent: 100,
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

describe("District completion totals by list", () => {
  it("counts unique completed levels and extras, excluding removed results and levels", () => {
    const data: DataSet = {
      districts: [
        { id: 1, name: "Район", region: "spb" },
        { id: 2, name: "Пустой район", region: "lo" },
      ],
      players: [
        player(1, 1),
        player(2, 2),
        { ...player(3, 3), deletedAt: "2026-10-08" },
      ],
      levels: [
        level(1, "main", 1),
        level(2, "extended", 76),
        level(3, "legacy", null),
        level(4, "catalog", null),
        { ...level(5, "main", 10), deletedAt: "2026-10-08" },
        { ...level(6, "main", 20), listExcluded: 1 },
        level(7, "main", 30),
        level(8, "main", 40),
        level(9, "main", 50),
        level(10, "main", 60),
      ],
      records: [
        record(1, 1),
        record(2, 1, 2),
        record(3, 3),
        record(4, 4),
        record(5, 5),
        record(6, 6),
        { ...record(7, 7), manualPercent: 90 },
        { ...record(8, 8), active: 0 },
        { ...record(9, 9), deletedAt: "2026-10-08" },
        record(10, 10, 3),
      ],
      extras: [
        { id: 1, districtId: 1, levelId: 1, note: "", achievedAt: null },
        { id: 2, districtId: 1, levelId: 2, note: "", achievedAt: null },
        {
          id: 3,
          districtId: 1,
          levelId: 7,
          note: "",
          achievedAt: null,
          deletedAt: "2026-10-08",
        },
      ],
    };
    const result = rankings(data).districts;
    expect(result.find((district) => district.id === 1)).toMatchObject({
      completionCount: 2,
      mainCompletionCount: 1,
      extendedCompletionCount: 1,
      legacyCompletionCount: 1,
    });
    expect(result.find((district) => district.id === 2)).toMatchObject({
      completionCount: 0,
      mainCompletionCount: 0,
      extendedCompletionCount: 0,
      legacyCompletionCount: 0,
      rank: null,
    });
  });
});

describe("Adjacent player profiles", () => {
  it("follows leaderboard order, using id for a stable order between tied players", () => {
    const players = [player(4, 3), player(3, 2), player(1, 1), player(2, 2)];
    const neighbors = playerNeighbors(players, 2);
    expect(neighbors.previous?.id).toBe(1);
    expect(neighbors.next?.id).toBe(3);
    expect(players.map((entry) => entry.id)).toEqual([4, 3, 1, 2]);
  });
  it("does not link to hidden, deleted, or unranked players", () => {
    const players = [
      player(1, 1),
      { ...player(2, 2), hidden: 1 },
      { ...player(3, 3), deletedAt: "2026-10-08" },
      player(4, null),
      player(5, 4),
    ];
    expect(playerNeighbors(players, 1).next?.id).toBe(5);
    expect(playerNeighbors(players, 2)).toEqual({ previous: null, next: null });
    expect(playerNeighbors(players, 4)).toEqual({ previous: null, next: null });
  });
  it("leaves the first and last edges empty, without wrapping", () => {
    const players = [player(1, 1), player(2, 2)];
    expect(playerNeighbors(players, 1).previous).toBeNull();
    expect(playerNeighbors(players, 2).next).toBeNull();
    expect(playerNeighbors([], 1)).toEqual({ previous: null, next: null });
  });
});
