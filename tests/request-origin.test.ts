import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "../server/services/request-origin";

describe("request origin", () => {
  it("accepts local aliases on the configured port", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(
        isAllowedOrigin(`http://${host}:3000`, "http://127.0.0.1:3000"),
      ).toBe(true);
    }
  });

  it("rejects a different local port or protocol", () => {
    expect(
      isAllowedOrigin("http://localhost:3001", "http://127.0.0.1:3000"),
    ).toBe(false);
    expect(
      isAllowedOrigin("https://localhost:3000", "http://127.0.0.1:3000"),
    ).toBe(false);
  });

  it("does not allow loopback aliases for a deployed site", () => {
    expect(
      isAllowedOrigin("http://localhost:3000", "https://spb.example"),
    ).toBe(false);
    expect(isAllowedOrigin("https://spb.example", "https://spb.example/")).toBe(
      true,
    );
    expect(
      isAllowedOrigin("https://other.example", "https://spb.example"),
    ).toBe(false);
  });

  it("rejects missing, malformed and deceptive origins", () => {
    for (const origin of [
      undefined,
      "null",
      "invalid",
      "http://localhost.evil.test:3000",
      "http://localhost:3000/path",
      "http://user@localhost:3000",
    ]) {
      expect(isAllowedOrigin(origin, "http://127.0.0.1:3000")).toBe(false);
    }
  });
});
