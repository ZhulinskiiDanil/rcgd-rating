import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const map = JSON.parse(
  readFileSync(
    new URL("../public/geo/districts.json", import.meta.url),
    "utf8",
  ),
) as {
  license: string;
  timestamp: string;
  viewBox: [number, number, number, number];
  cityBounds: [number, number, number, number];
  features: {
    osmId: number;
    name: string;
    region: "spb" | "lo";
    bounds: [number, number, number, number];
    path: string;
  }[];
};
const rings = (path: string) =>
  path
    .split("Z")
    .filter(Boolean)
    .map((ring) =>
      ring
        .slice(1)
        .split("L")
        .map((point) => point.split(",").map(Number)),
    );

describe("district map geographic data", () => {
  it("covers all 18 city and 18 oblast districts without conflating repeated names", () => {
    expect(
      map.features.filter((feature) => feature.region === "spb"),
    ).toHaveLength(18);
    expect(
      map.features.filter((feature) => feature.region === "lo"),
    ).toHaveLength(18);
    expect(
      new Set(
        map.features.map((feature) => `${feature.region}:${feature.name}`),
      ).size,
    ).toBe(36);
    expect(new Set(map.features.map((feature) => feature.osmId)).size).toBe(36);
    expect(
      map.features.filter((feature) => feature.name === "Выборгский"),
    ).toHaveLength(2);
    expect(
      map.features.filter((feature) => feature.name === "Кировский"),
    ).toHaveLength(2);
    expect(
      map.features.find((feature) => feature.name === "Сосновоборский")?.region,
    ).toBe("lo");
  });

  it("has finite closed polygons and valid fitting bounds for every selectable district", () => {
    for (const feature of map.features) {
      expect(feature.path).toMatch(/^(M[\d.,L-]+Z)+$/);
      const [left, top, width, height] = feature.bounds;
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      for (const ring of rings(feature.path)) {
        expect(ring.length).toBeGreaterThanOrEqual(3);
        for (const [x, y] of ring) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(left - 0.02);
          expect(x).toBeLessThanOrEqual(left + width + 0.02);
          expect(y).toBeGreaterThanOrEqual(top - 0.02);
          expect(y).toBeLessThanOrEqual(top + height + 0.02);
          expect(x).toBeGreaterThanOrEqual(map.viewBox[0]);
          expect(x).toBeLessThanOrEqual(map.viewBox[2]);
          expect(y).toBeGreaterThanOrEqual(map.viewBox[1]);
          expect(y).toBeLessThanOrEqual(map.viewBox[3]);
        }
      }
    }
  });

  it("preserves matching shared edges between adjoining central districts", () => {
    function edges(name: string) {
      const feature = map.features.find(
        (item) => item.region === "spb" && item.name === name,
      )!;
      return new Set(
        rings(feature.path).flatMap((ring) =>
          ring.map((point, index) =>
            [point.join(","), ring[(index + 1) % ring.length]!.join(",")]
              .sort()
              .join("|"),
          ),
        ),
      );
    }
    const central = edges("Центральный"),
      admiralty = edges("Адмиралтейский");
    expect(
      [...central].filter((edge) => admiralty.has(edge)).length,
    ).toBeGreaterThan(2);
  });

  it("provides a city zoom extent containing every city district and provenance for attribution", () => {
    const [left, top, width, height] = map.cityBounds;
    expect(width).toBeLessThan(map.viewBox[2] / 2);
    for (const feature of map.features.filter(
      (item) => item.region === "spb",
    )) {
      expect(feature.bounds[0]).toBeGreaterThanOrEqual(left - 0.02);
      expect(feature.bounds[1]).toBeGreaterThanOrEqual(top - 0.02);
      expect(feature.bounds[0] + feature.bounds[2]).toBeLessThanOrEqual(
        left + width + 0.02,
      );
      expect(feature.bounds[1] + feature.bounds[3]).toBeLessThanOrEqual(
        top + height + 0.02,
      );
    }
    expect(map.license).toBe("ODbL-1.0");
    expect(Number.isFinite(Date.parse(map.timestamp))).toBe(true);
  });
});
