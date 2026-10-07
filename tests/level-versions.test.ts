import { describe, expect, it } from "vitest";
import { gameVersionBatch } from "../server/services/level-versions";
import type { GlobalLevel } from "../server/services/sources";

const levels: GlobalLevel[] = Array.from({ length: 600 }, (_, index) => ({
  id: index + 1,
  name: `Level ${index + 1}`,
  placement: index + 1,
}));
const stored = (gdlId: number, localRank: number, gameVersion = "") => ({
  gdlId,
  localRank,
  gameVersion,
  status: localRank <= 75 ? ("main" as const) : ("extended" as const),
  listExcluded: 0,
  deletedAt: null,
});

describe("game version queue", () => {
  it("prioritizes every local Main/Extended level before unrelated global entries", () => {
    const local = Array.from({ length: 150 }, (_, index) =>
      stored(index + 401, index + 1),
    );
    const result = gameVersionBatch(levels, local, null);
    expect(result.batch).toHaveLength(200);
    expect(result.batch.slice(0, 150).map((level) => level.id)).toEqual(
      local.map((level) => level.gdlId),
    );
    expect(result.batch.slice(150).map((level) => level.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    expect(result.nextCursor).toBe(50);
  });

  it("rotates past failed entries even when all prior requests still lack versions", () => {
    const first = gameVersionBatch(levels, [], null);
    const second = gameVersionBatch(levels, [], first.nextCursor);
    const third = gameVersionBatch(levels, [], second.nextCursor);
    expect(first.batch.map((level) => level.id)).toEqual(
      Array.from({ length: 200 }, (_, index) => index + 1),
    );
    expect(second.batch[0]?.id).toBe(201);
    expect(third.batch[0]?.id).toBe(401);
    expect(gameVersionBatch(levels, [], third.nextCursor).batch[0]?.id).toBe(1);
    expect(
      new Set(
        [...first.batch, ...second.batch, ...third.batch].map(
          (level) => level.id,
        ),
      ).size,
    ).toBe(600);
  });

  it("keeps retrying current levels while other failures move through the remaining slots", () => {
    const local = Array.from({ length: 150 }, (_, index) =>
      stored(index + 401, index + 1),
    );
    const first = gameVersionBatch(levels, local, null);
    const second = gameVersionBatch(levels, local, first.nextCursor);
    expect(second.batch.slice(0, 150).map((level) => level.id)).toEqual(
      local.map((level) => level.gdlId),
    );
    expect(second.batch.slice(150).map((level) => level.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 51),
    );
  });

  it("skips stored and upstream versions, preserving manual values and continuing after a successful cursor entry", () => {
    const upstream = levels.map((level) =>
      level.id === 2 ? { ...level, game_version: "2.2" } : level,
    );
    const result = gameVersionBatch(
      upstream,
      [stored(1, 1, "2.1"), stored(200, 2, "2.0")],
      200,
    );
    expect(result.batch[0]?.id).toBe(201);
    expect(result.batch.some((level) => [1, 2, 200].includes(level.id))).toBe(
      false,
    );
    expect(result.missingCount).toBe(597);
  });
});
