import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Input: the unmodified JSON response to the Overpass query in public/geo/README.md.
const sourcePath = process.argv[2];
if (!sourcePath)
  throw new Error("Usage: node scripts/build-district-map.mjs <overpass.json>");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const relations = source.elements.filter((item) => item.type === "relation");
if (relations.length !== 36)
  throw new Error(`Expected 36 districts, received ${relations.length}`);

function project(point) {
  const latitude = (point.lat * Math.PI) / 180;
  return [
    (point.lon * Math.PI) / 180,
    -Math.log(Math.tan(Math.PI / 4 + latitude / 2)),
  ];
}
const coordinates = relations.flatMap((relation) =>
  relation.members.flatMap((member) => member.geometry?.map(project) ?? []),
);
const minX = Math.min(...coordinates.map((point) => point[0]));
const minY = Math.min(...coordinates.map((point) => point[1]));
const maxX = Math.max(...coordinates.map((point) => point[0]));
const maxY = Math.max(...coordinates.map((point) => point[1]));
const scale = 952 / (maxX - minX);
const height = Math.ceil((maxY - minY) * scale + 48);
const toMap = (point) => {
  const projected = project(point);
  return [
    (projected[0] - minX) * scale + 24,
    (projected[1] - minY) * scale + 24,
  ];
};

function squaredDistance(point, start, end) {
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  const t =
    dx || dy
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
              (dx * dx + dy * dy),
          ),
        )
      : 0;
  return (
    (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2
  );
}
function simplify(points, tolerance = 0.25) {
  if (points.length < 3) return points;
  let farthest = 0,
    distance = tolerance ** 2;
  for (let index = 1; index < points.length - 1; index++) {
    const value = squaredDistance(points[index], points[0], points.at(-1));
    if (value > distance) {
      farthest = index;
      distance = value;
    }
  }
  return farthest
    ? [
        ...simplify(points.slice(0, farthest + 1), tolerance).slice(0, -1),
        ...simplify(points.slice(farthest), tolerance),
      ]
    : [points[0], points.at(-1)];
}
const wayCache = new Map();
function wayPoints(member) {
  if (!wayCache.has(member.ref))
    wayCache.set(member.ref, simplify(member.geometry.map(toMap)));
  return wayCache.get(member.ref);
}
const same = (a, b) =>
  Math.abs(a[0] - b[0]) < 0.000001 && Math.abs(a[1] - b[1]) < 0.000001;
function ringsFor(relation, role) {
  const segments = relation.members
    .filter(
      (member) =>
        member.type === "way" &&
        (member.role || "outer") === role &&
        member.geometry?.length > 1,
    )
    .map((member) => [...wayPoints(member)]);
  const rings = [];
  while (segments.length) {
    let ring = segments.pop();
    while (!same(ring[0], ring.at(-1))) {
      const index = segments.findIndex(
        (segment) =>
          same(ring.at(-1), segment[0]) || same(ring.at(-1), segment.at(-1)),
      );
      if (index < 0)
        throw new Error(`Unclosed ${role} ring in OSM relation ${relation.id}`);
      const [next] = segments.splice(index, 1);
      if (same(ring.at(-1), next.at(-1))) next.reverse();
      ring.push(...next.slice(1));
    }
    if (ring.length > 3) rings.push(ring);
  }
  return rings;
}
const round = (value) => Math.round(value * 100) / 100;
function bounds(points) {
  const left = Math.min(...points.map((point) => point[0]));
  const top = Math.min(...points.map((point) => point[1]));
  return [
    left,
    top,
    Math.max(...points.map((point) => point[0])) - left,
    Math.max(...points.map((point) => point[1])) - top,
  ].map(round);
}
const features = relations
  .map((relation) => {
    const rings = [
      ...ringsFor(relation, "outer"),
      ...ringsFor(relation, "inner"),
    ];
    if (!rings.length)
      throw new Error(`Missing rings in OSM relation ${relation.id}`);
    return {
      osmId: relation.id,
      name: /^Гатчинский /.test(relation.tags.name)
        ? "Гатчинский муниципальный округ"
        : /^Сосновоборский /.test(relation.tags.name)
          ? "Сосновоборский городской округ"
          : relation.tags.name.replace(
              / (район|муниципальный округ|городской округ)$/,
              "",
            ),
      sourceName: relation.tags.name,
      region: relation.tags.admin_level === "5" ? "spb" : "lo",
      bounds: bounds(rings.flat()),
      path: rings
        .map(
          (ring) =>
            `M${ring
              .slice(0, -1)
              .map((point) => point.map(round).join(","))
              .join("L")}Z`,
        )
        .join(""),
    };
  })
  .sort(
    (a, b) =>
      a.region.localeCompare(b.region) || a.name.localeCompare(b.name, "ru"),
  );

if (
  new Set(features.map((feature) => `${feature.region}:${feature.name}`))
    .size !== 36
)
  throw new Error("Duplicate district names");
const cityBounds = bounds(
  features
    .filter((feature) => feature.region === "spb")
    .flatMap((feature) => [
      [feature.bounds[0], feature.bounds[1]],
      [
        feature.bounds[0] + feature.bounds[2],
        feature.bounds[1] + feature.bounds[3],
      ],
    ]),
);
const result = {
  source: "OpenStreetMap contributors",
  license: "ODbL-1.0",
  timestamp: source.osm3s?.timestamp_osm_base,
  viewBox: [0, 0, 1000, height],
  cityBounds,
  features,
};
const output = resolve("public/geo/districts.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result));
console.log(
  `Saved ${features.length} districts, ${JSON.stringify(result).length} characters, viewBox ${result.viewBox.join(" ")}`,
);
