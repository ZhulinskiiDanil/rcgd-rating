import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:3100";
const password = randomBytes(24).toString("base64url");
const server = spawn(process.execPath, [".output/server/index.mjs"], {
  windowsHide: true,
  env: {
    ...process.env,
    PORT: "3100",
    HOST: "127.0.0.1",
    APP_ORIGIN: origin,
    DATABASE_PATH: join(
      mkdtempSync(join(tmpdir(), "spb-http-")),
      "test.sqlite",
    ),
    NUXT_SESSION_PASSWORD: randomBytes(48).toString("base64url"),
    HEAD_ADMIN_LOGIN: "testadmin",
    HEAD_ADMIN_PASSWORD: password,
    SYNC_ENABLED: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", (b) => {
  output += b;
});
server.stderr.on("data", (b) => {
  output += b;
});
async function call(
  path,
  {
    method = "GET",
    body,
    raw,
    contentType = "application/json",
    cookie,
    requestOrigin = origin,
  } = {},
) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      "Content-Type": contentType,
      ...(method !== "GET" ? { Origin: requestOrigin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
    ...(raw instanceof ReadableStream ? { duplex: "half" } : {}),
  });
  const text = await response.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return {
    status: response.status,
    value,
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await call("/api/health")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready, output);
  assert.equal((await call("/api/admin")).status, 401);
  const login = await call("/api/auth/login", {
    method: "POST",
    body: { login: "testadmin", password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.value));
  const admin = login.cookie;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMfkAAAAASUVORK5CYII=",
    "base64",
  );
  const uploaded = await call("/api/admin/media", {
    method: "POST",
    cookie: admin,
    raw: png,
    contentType: "image/png",
  });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.value));
  assert.match(uploaded.value.url, /^\/media\/[0-9a-f-]+\.png$/);
  const image = await fetch(origin + uploaded.value.url);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal(
    (
      await call("/api/admin/media", {
        method: "POST",
        cookie: admin,
        raw: Buffer.from("<svg/>"),
        contentType: "image/png",
      })
    ).status,
    415,
  );
  const tooLarge = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(5 * 1024 * 1024));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  assert.equal(
    (
      await call("/api/admin/media", {
        method: "POST",
        cookie: admin,
        raw: tooLarge,
        contentType: "image/png",
      })
    ).status,
    413,
  );
  const adminId = (await call("/api/auth/me", { cookie: admin })).value.id;
  assert.equal(
    (
      await call("/api/admin/accounts", {
        method: "POST",
        cookie: admin,
        body: { id: adminId, avatarUrl: uploaded.value.url },
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/auth/me", { cookie: admin })).value.avatar,
    uploaded.value.url,
  );
  assert.equal(
    (
      await call("/api/admin/accounts", {
        method: "POST",
        cookie: admin,
        body: { id: adminId, disabled: true },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("/api/auth/me", { cookie: admin })).value.headAdmin,
    true,
  );
  const localLogin = await call("/api/auth/login", {
    method: "POST",
    requestOrigin: "http://localhost:3100",
    body: { login: "testadmin", password },
  });
  assert.equal(localLogin.status, 200, JSON.stringify(localLogin.value));
  assert.equal(
    (await call("/api/auth/me", { cookie: admin })).value.headAdmin,
    true,
  );
  assert.equal(
    (
      await call("/api/admin/districts", {
        method: "POST",
        cookie: admin,
        requestOrigin: "https://invalid.test",
        body: { name: "Injected", region: "spb" },
      })
    ).status,
    403,
  );
  const registered = await call("/api/auth/register", {
    method: "POST",
    body: { login: "regular", password },
  });
  assert.equal(registered.status, 200);
  const regular = registered.cookie;
  const me = (await call("/api/auth/me", { cookie: regular })).value;
  assert.equal(me.headAdmin, false);
  assert.deepEqual(me.permissions, []);
  assert.equal(
    (
      await call("/api/admin/media", {
        method: "POST",
        cookie: regular,
        raw: png,
        contentType: "image/png",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/admin/players", {
        method: "POST",
        cookie: regular,
        body: { name: "Denied" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/admin/accounts", {
        method: "POST",
        cookie: admin,
        body: {
          id: me.id,
          permissions: ["players:write"],
          disabled: false,
          avatarUrl: uploaded.value.url,
        },
      })
    ).status,
    200,
  );
  const player = await call("/api/admin/players", {
    method: "POST",
    cookie: regular,
    body: {
      name: "Smoke player",
      districtId: 1,
      gdlId: null,
      accountId: me.id,
      bio: "Test",
    },
  });
  assert.equal(player.status, 200, JSON.stringify(player.value));
  assert.equal(
    (await call("/api/catalog")).value.players[0].avatar,
    uploaded.value.url,
  );
  assert.equal(
    (
      await call("/api/admin/media", {
        method: "POST",
        cookie: regular,
        raw: png,
        contentType: "image/png",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/admin/accounts", {
        method: "POST",
        cookie: regular,
        body: { id: me.id, avatarUrl: "" },
      })
    ).status,
    403,
  );
  const playerFields = {
    id: player.value.id,
    name: "Smoke player",
    districtId: 1,
    gdlId: null,
    accountId: me.id,
    bio: "Test",
  };
  assert.equal(
    (
      await call("/api/admin/players", {
        method: "POST",
        cookie: regular,
        body: { ...playerFields, avatarUrl: "javascript:alert(1)" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/admin/players", {
        method: "POST",
        cookie: regular,
        body: { ...playerFields, avatarUrl: "https://example.com/player.png" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/catalog")).value.players[0].avatar,
    "https://example.com/player.png",
  );
  assert.equal(
    (
      await call("/api/admin/players", {
        method: "POST",
        cookie: regular,
        body: { ...playerFields, avatarUrl: "" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/catalog")).value.players[0].avatar,
    uploaded.value.url,
  );
  const fakeLevel = await call("/api/admin/levels", {
    method: "POST",
    cookie: admin,
    body: {
      name: "Test level",
      verifiedLocal: false,
      creator: "Test",
      video: "",
      thresholdName: null,
    },
  });
  assert.equal(fakeLevel.status, 200);
  const news = await call("/api/admin/news", {
    method: "POST",
    cookie: admin,
    body: { title: "Smoke news" },
  });
  assert.equal(news.status, 200);
  const selectedNews = await call(`/api/admin?newsId=${news.value.id}`, {
    cookie: admin,
  });
  assert.equal(selectedNews.status, 200);
  assert.deepEqual(
    selectedNews.value.news.map((item) => item.id),
    [news.value.id],
  );
  assert.deepEqual(
    (await call(`/api/admin?newsId=${news.value.id}`, { cookie: regular }))
      .value.news,
    [],
  );
  const levelFields = {
    id: fakeLevel.value.id,
    name: "Test level",
    verifiedLocal: false,
    creator: "Test",
    video: "",
    thresholdName: null,
  };
  assert.equal(
    (
      await call("/api/admin/levels", {
        method: "POST",
        cookie: admin,
        body: { ...levelFields, verificationPlayerId: player.value.id },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/admin/levels", {
        method: "POST",
        cookie: admin,
        body: {
          ...levelFields,
          verificationPlayerId: 999999,
          verificationRegion: "spb",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/admin/levels", {
        method: "POST",
        cookie: admin,
        body: {
          ...levelFields,
          previewImage: uploaded.value.url,
          showcaseVideo: "https://example.com/showcase",
          verificationPlayerId: player.value.id,
          verificationRegion: "spb",
          verificationDate: "2026-10-01",
        },
      })
    ).status,
    200,
  );
  const beforeRecord = (await call("/api/catalog")).value;
  assert.equal(beforeRecord.records.length, 0);
  assert.equal(beforeRecord.levels[0].verifiedLocal, 0);
  assert.equal(beforeRecord.levels[0].previewImage, uploaded.value.url);
  assert.equal(
    (
      await call("/api/admin/levels", {
        method: "POST",
        cookie: admin,
        body: levelFields,
      })
    ).status,
    200,
  );
  const preserved = (await call("/api/catalog")).value.levels[0];
  assert.equal(preserved.showcaseVideo, "https://example.com/showcase");
  assert.equal(preserved.verificationDate, "2026-10-01");
  assert.equal(preserved.previewImage, uploaded.value.url);
  assert.deepEqual((await call("/api/changes?kind=avatar")).value, []);
  const record = await call("/api/admin/records", {
    method: "POST",
    cookie: admin,
    body: {
      playerId: player.value.id,
      levelId: fakeLevel.value.id,
      manualPercent: 100,
      active: true,
      manualVideo: "https://example.com/video",
      achievedAt: null,
      note: "Private test note",
      reviewNeeded: false,
    },
  });
  assert.equal(record.status, 200, JSON.stringify(record.value));
  const unknownVideoDate = await call("/api/admin/video-date", {
    method: "POST",
    cookie: admin,
    body: { url: "https://example.com/video" },
  });
  assert.equal(unknownVideoDate.status, 200);
  assert.equal(unknownVideoDate.value.date, null);
  assert.ok(unknownVideoDate.value.message.includes("вручную"));
  assert.equal(
    (
      await call("/api/admin/video-date", {
        method: "POST",
        cookie: regular,
        body: { url: "https://example.com/video" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/admin/video-date", {
        method: "POST",
        cookie: admin,
        body: { url: "file:///private" },
      })
    ).status,
    400,
  );
  const recordFields = {
    id: record.value.id,
    playerId: player.value.id,
    levelId: fakeLevel.value.id,
    manualPercent: 100,
    active: true,
    manualVideo: "https://example.com/video",
    note: "Private test note",
    reviewNeeded: false,
  };
  assert.equal(
    (
      await call("/api/admin/records", {
        method: "POST",
        cookie: admin,
        body: {
          ...recordFields,
          achievedAt: "2025-03-14",
          dateSource: "manual",
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/catalog")).value.records[0].dateSource,
    "manual",
  );
  assert.equal(
    (
      await call("/api/admin/records", {
        method: "POST",
        cookie: admin,
        body: recordFields,
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/catalog")).value.records[0].achievedAt,
    "2025-03-14",
  );
  assert.equal(
    (
      await call("/api/admin/records", {
        method: "POST",
        cookie: admin,
        body: {
          ...recordFields,
          dateSource: "video",
          achievedAt: "2020-01-01",
          sourceVideo: "https://example.com/forged",
        },
      })
    ).status,
    200,
  );
  const automatic = (await call("/api/catalog")).value.records[0];
  assert.equal(automatic.achievedAt, null);
  assert.equal(automatic.dateSource, null);
  assert.equal(automatic.sourceVideo, "");
  const catalog = (await call("/api/catalog")).value;
  assert.equal(catalog.players.length, 1);
  assert.equal(catalog.records.length, 1);
  assert.equal(catalog.districts.find((d) => d.id === 1).completionCount, 1);
  assert.equal("note" in catalog.records[0], false);
  assert.ok(!JSON.stringify(catalog).includes("passwordHash"));
  for (const page of [
    "/",
    "/legacy",
    "/players",
    "/players/" + player.value.id,
    "/levels/" + fakeLevel.value.id,
    "/districts",
    "/districts/1",
    "/rules",
    "/changelog",
    "/login",
  ]) {
    const response = await call(page);
    assert.equal(response.status, 200, page);
    assert.ok(!response.value.includes("Internal Server Error"), page);
  }
  assert.equal(
    (
      await call("/api/admin/accounts", {
        method: "POST",
        cookie: admin,
        body: { id: me.id, permissions: [], disabled: false },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/admin/players", {
        method: "POST",
        cookie: regular,
        body: { name: "Revoked" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/admin/accounts", {
        method: "POST",
        cookie: admin,
        body: { id: me.id, permissions: [], disabled: true },
      })
    ).status,
    200,
  );
  assert.equal(
    Boolean((await call("/api/auth/me", { cookie: regular })).value),
    false,
  );
  assert.equal(
    (
      await call("/api/auth/login", {
        method: "POST",
        body: { login: "regular", password },
      })
    ).status,
    401,
  );
  assert.equal(
    (await call("/api/auth/logout", { method: "POST", cookie: admin })).status,
    200,
  );
  console.log(
    "HTTP smoke passed: public pages, registration, password login, manual record, district results, CSRF, permissions grant/revocation, disabled account, logout.",
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  server.kill();
}
