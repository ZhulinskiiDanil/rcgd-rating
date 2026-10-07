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
  shoreline: {
    lakeRelation: number;
    seaSource: string;
    projection: { minX: number; minY: number; scale: number };
  };
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
  it("retains full names for municipal and urban okrugs", () => {
    expect(
      map.features.find(
        (feature) =>
          feature.region === "lo" && feature.name.startsWith("Гатчинский"),
      )?.name,
    ).toBe("Гатчинский муниципальный округ");
    expect(
      map.features.find(
        (feature) =>
          feature.region === "lo" && feature.name.startsWith("Сосновоборский"),
      )?.name,
    ).toBe("Сосновоборский городской округ");
  });
  it("excludes Gulf and Ladoga water from interactive district paths while preserving land", () => {
    const { minX, minY, scale } = map.shoreline.projection;
    const at = (lon: number, lat: number) => {
      const x = ((lon * Math.PI) / 180 - minX) * scale + 24;
      const y =
        (-Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) - minY) *
          scale +
        24;
      return map.features.filter((feature) => {
        let inside = false;
        for (const ring of rings(feature.path))
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i]! as [number, number];
            const [xj, yj] = ring[j]! as [number, number];
            if (
              yi > y !== yj > y &&
              x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
            )
              inside = !inside;
          }
        return inside;
      });
    };
    expect(at(28.9, 60.0)).toHaveLength(0);
    expect(at(31.7, 60.7)).toHaveLength(0);
    expect(at(29.13, 60.02)).toHaveLength(0);
    expect(
      at(30.13, 59.57).some(
        (feature) => feature.name === "Гатчинский муниципальный округ",
      ),
    ).toBe(true);
    expect(
      at(29.09, 59.9).some(
        (feature) => feature.name === "Сосновоборский городской округ",
      ),
    ).toBe(true);
    expect(map.shoreline.lakeRelation).toBeGreaterThan(0);
    expect(map.shoreline.seaSource).toContain("osmdata.openstreetmap.de");
  });
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
      map.features.find(
        (feature) => feature.name === "Сосновоборский городской округ",
      )?.region,
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
