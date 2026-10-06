import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import { resolveDatabasePath } from "../server/database/path";

const mount = resolve("railway-volume");
const railway = {
  RAILWAY_ENVIRONMENT_ID: "production",
  RAILWAY_VOLUME_MOUNT_PATH: mount,
  DATABASE_PATH: join(mount, "spb.sqlite"),
};

describe("Railway SQLite persistence guard", () => {
  it("keeps the local default and smoke-test paths without Railway variables", () => {
    expect(resolveDatabasePath({})).toBe(resolve(".data/spb.sqlite"));
    expect(
      resolveDatabasePath({ DATABASE_PATH: "temporary/test.sqlite" }),
    ).toBe(resolve("temporary/test.sqlite"));
  });

  it.each([
    "RAILWAY_ENVIRONMENT_ID",
    "RAILWAY_PROJECT_ID",
    "RAILWAY_SERVICE_ID",
    "RAILWAY_DEPLOYMENT_ID",
  ])(
    "refuses an ephemeral database when %s identifies Railway but no volume is attached",
    (key) => {
      expect(() =>
        resolveDatabasePath({
          [key]: "railway",
          DATABASE_PATH: join(mount, "spb.sqlite"),
        }),
      ).toThrow("RAILWAY_VOLUME_MOUNT_PATH");
    },
  );

  it("requires an explicit absolute database path in Railway", () => {
    for (const DATABASE_PATH of [undefined, "", "spb.sqlite", "../spb.sqlite"])
      expect(() => resolveDatabasePath({ ...railway, DATABASE_PATH })).toThrow(
        "абсолютный DATABASE_PATH",
      );
  });

  it("requires an absolute volume mount path", () => {
    expect(() =>
      resolveDatabasePath({ ...railway, RAILWAY_VOLUME_MOUNT_PATH: "data" }),
    ).toThrow("RAILWAY_VOLUME_MOUNT_PATH");
  });

  it("accepts files in the volume root and nested directories", () => {
    expect(resolveDatabasePath(railway)).toBe(join(mount, "spb.sqlite"));
    const DATABASE_PATH = join(mount, "databases", "spb.sqlite");
    expect(resolveDatabasePath({ ...railway, DATABASE_PATH })).toBe(
      DATABASE_PATH,
    );
  });

  it("rejects prefix matches, parent traversal and the mount directory itself", () => {
    for (const DATABASE_PATH of [
      join(`${mount}-other`, "spb.sqlite"),
      join(mount, "..", "spb.sqlite"),
      mount,
    ])
      expect(() => resolveDatabasePath({ ...railway, DATABASE_PATH })).toThrow(
        "файл внутри RAILWAY_VOLUME_MOUNT_PATH",
      );
  });
});
