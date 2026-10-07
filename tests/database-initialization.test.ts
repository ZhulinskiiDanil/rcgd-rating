import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: 0,
  failed: null as Database.Database | null,
}));
vi.mock("../server/database/community", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../server/database/community")>();
  return {
    migrateCommunity(connection: Database.Database) {
      state.calls += 1;
      if (state.calls === 1) {
        state.failed = connection;
        throw new Error("Simulated migration failure");
      }
      actual.migrateCommunity(connection);
    },
  };
});

process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "spb-db-retry-")),
  "test.sqlite",
);
const { db } = await import("../server/database");

it("closes a failed initialization and retries migrations on the next access", () => {
  expect(() => db()).toThrow("Simulated migration failure");
  expect(state.failed?.open).toBe(false);
  const recovered = db();
  try {
    expect(recovered.open).toBe(true);
    expect(recovered).not.toBe(state.failed);
    expect(state.calls).toBe(2);
    expect(recovered.pragma("foreign_key_check")).toEqual([]);
    expect(
      recovered
        .prepare(
          "SELECT name FROM pragma_table_info('players') WHERE name='deletedAt'",
        )
        .get(),
    ).toEqual({ name: "deletedAt" });
    expect(db()).toBe(recovered);
    expect(state.calls).toBe(2);
  } finally {
    recovered.close();
  }
});
