import { describe, it, expect } from "vitest";
import {
  weightedTop,
  progressPosition,
  playerRating,
  districtRating,
  completedLevels,
  hypotheticalPosition,
} from "../shared/utils/rating";
import type {
  DataSet,
  Level,
  RecordEntry,
  Player,
} from "../shared/types/domain";
const level = (id: number, globalRank = id): Level => ({
  id,
  gdlId: id,
  name: `Level ${id}`,
  globalRank,
  localRank: null,
  listPercent: 50,
  endPercent: 100,
  thresholdName: null,
  thresholdSource: null,
  verifiedLocal: 1,
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
const record = (
  id: number,
  playerId: number,
  levelId: number,
  percent: number,
): RecordEntry => ({
  id,
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
const player = (id: number, districtId = 1): Player => ({
  id,
  name: `Player ${id}`,
  districtId,
  gdlId: null,
  bio: "",
  accountId: null,
  avatarUrl: "",
  inactive: 0,
});
const data = (): DataSet => ({
  levels: Array.from({ length: 160 }, (_, i) => level(i + 1)),
  players: [player(1), player(2)],
  districts: [{ id: 1, name: "Район", region: "spb" }],
  records: [],
  extras: [],
});
describe("Рейтинг", () => {
  it("пустые результаты дают ровно 150", () =>
    expect(weightedTop([]).score).toBe(150));
  it("применяет шесть заданных весов, отбрасывая седьмой", () => {
    const d = data();
    d.records = Array.from({ length: 7 }, (_, i) =>
      record(i + 1, 1, i + 1, 100),
    );
    expect(playerRating(d, 1).score).toBeCloseTo(
      (10 + 18 + 24 + 28 + 25 + 18) / 42,
    );
    expect(playerRating(d, 1).top).toHaveLength(6);
  });
  it("дополняет отсутствующие результаты значением 150", () => {
    const d = data();
    d.records = [record(1, 1, 1, 100)];
    expect(playerRating(d, 1).score).toBeCloseTo((10 + 150 * 32) / 42);
  });
  it("даёт 4h на лист-проценте и 2h на эндинге", () => {
    expect(progressPosition(10, 50, 50, 90)).toBeCloseTo(40);
    expect(progressPosition(10, 90, 50, 90)).toBeCloseTo(20);
    expect(progressPosition(10, 99, 50, 90)).toBeCloseTo(20);
  });
  it("отбрасывает прогрессы ниже t, хуже 150 и некорректные пороги", () => {
    expect(progressPosition(10, 49, 50, 90)).toBeNull();
    expect(progressPosition(50, 50, 50, 90)).toBeNull();
    expect(progressPosition(10, 70, 80, 80)).toBeNull();
    expect(progressPosition(10, 100, 50, 90)).toBeNull();
  });
  it("использует предполагаемую местную позицию непройденного уровня", () => {
    const d = data();
    d.levels = [
      level(1, 10),
      { ...level(2, 5), verifiedLocal: 0 },
      level(3, 20),
    ];
    d.records = [record(1, 1, 2, 50)];
    expect(completedLevels(d).map((l) => l.id)).toEqual([1, 3]);
    expect(hypotheticalPosition(d.levels[1]!, completedLevels(d))).toBe(1);
    expect(playerRating(d, 1).top[0]?.position).toBeCloseTo(4);
  });
  it("не учитывает прогресс глобального #151", () => {
    const d = data();
    d.records = [record(1, 1, 151, 99)];
    expect(playerRating(d, 1).score).toBe(150);
  });
  it("локальное прохождение за глобальным топом-150 всё ещё считается", () => {
    const d = data();
    d.levels = [level(1, 300)];
    d.records = [record(1, 1, 1, 100)];
    expect(playerRating(d, 1).top[0]?.position).toBe(1);
  });
  it("100% заменяет прогресс и не занимает два слота", () => {
    const d = data();
    d.records = [{ ...record(1, 1, 1, 90), importedPercent: 100 }];
    expect(playerRating(d, 1).top.filter((r) => r.levelId)).toHaveLength(1);
    expect(playerRating(d, 1).top[0]?.kind).toBe("completion");
  });
  it("два прохождения одного уровня в районе считаются один раз; прогресс не считается", () => {
    const d = data();
    d.records = [
      record(1, 1, 1, 100),
      record(2, 2, 1, 100),
      record(3, 2, 2, 99),
    ];
    expect(districtRating(d, 1).top.filter((r) => r.levelId)).toHaveLength(1);
  });
  it("переезд переносит все достижения", () => {
    const d = data();
    d.records = [record(1, 1, 1, 100)];
    d.players[0]!.districtId = 2;
    expect(districtRating(d, 1).score).toBe(150);
    expect(districtRating(d, 2).top[0]?.levelId).toBe(1);
  });
  it("добавленные достижения района участвуют без карточки игрока", () => {
    const d = data();
    d.extras = [
      { id: 1, districtId: 1, levelId: 2, note: "", achievedAt: null },
    ];
    expect(districtRating(d, 1).top[0]?.levelId).toBe(2);
  });
  it("отключённый рекорд не учитывается", () => {
    const d = data();
    d.records = [{ ...record(1, 1, 1, 100), active: 0 }];
    expect(playerRating(d, 1).score).toBe(150);
  });
});
