"""Clip the generated district SVG paths to OSM sea and Lake Ladoga shorelines.

Build-time dependencies: shapely, pyshp. See public/geo/README.md for sources.
"""
import argparse
import io
import json
import math
import zipfile
from pathlib import Path

import shapefile
from shapely import affinity, make_valid
from shapely.geometry import Polygon, box, shape
from shapely.ops import unary_union

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("boundaries", type=Path)
parser.add_argument("land_zip", type=Path)
parser.add_argument("lake", type=Path)
parser.add_argument("--map", type=Path, default=Path("public/geo/districts.json"))
args = parser.parse_args()

source = json.loads(args.boundaries.read_text(encoding="utf-8-sig"))
lake_source = json.loads(args.lake.read_text(encoding="utf-8-sig"))
data = json.loads(args.map.read_text(encoding="utf-8"))
radius = 6378137

def project(point):
    return [math.radians(point["lon"]), -math.log(math.tan(math.pi / 4 + math.radians(point["lat"]) / 2))]

coordinates = [project(point) for relation in source["elements"] if relation["type"] == "relation"
               for member in relation["members"] for point in member.get("geometry", [])]
min_x = min(point[0] for point in coordinates)
min_y = min(point[1] for point in coordinates)
max_x = max(point[0] for point in coordinates)
max_y = max(point[1] for point in coordinates)
scale = 952 / (max_x - min_x)
mercator_window = box(min_x * radius, -max_y * radius, max_x * radius, -min_y * radius)

def to_map(geometry):
    return affinity.affine_transform(geometry, [scale / radius, 0, 0, -scale / radius, 24 - min_x * scale, 24 - min_y * scale])

with zipfile.ZipFile(args.land_zip) as archive:
    files = {Path(name).suffix: name for name in archive.namelist()}
    reader = shapefile.Reader(**{suffix: io.BytesIO(archive.read(files["." + suffix])) for suffix in ["shp", "shx", "dbf"]})
    land_parts = [make_valid(shape(item.__geo_interface__)).intersection(mercator_window)
                  for item in reader.iterShapes(bbox=mercator_window.bounds)]
land = to_map(unary_union(land_parts))

def lake_rings(relation, role):
    segments = {}
    ends = {}
    for member in relation["members"]:
        if member["type"] != "way" or member.get("role", "outer") != role or len(member.get("geometry", [])) < 2:
            continue
        points = [(point["lon"], point["lat"]) for point in member["geometry"]]
        segments[member["ref"]] = points
        for end in [points[0], points[-1]]:
            ends.setdefault(end, []).append(member["ref"])
    rings = []
    while segments:
        _, ring = segments.popitem()
        while ring[0] != ring[-1]:
            key = next((key for key in ends[ring[-1]] if key in segments), None)
            if key is None:
                raise ValueError(f"Unclosed {role} ring in lake {relation['id']}")
            segment = segments.pop(key)
            if segment[-1] == ring[-1]:
                segment.reverse()
            ring.extend(segment[1:])
        points = [project({"lon": lon, "lat": lat}) for lon, lat in ring]
        rings.append(make_valid(Polygon([(x * radius, -y * radius) for x, y in points])))
    return unary_union(rings)

lakes = [relation for relation in lake_source["elements"] if relation["type"] == "relation" and relation.get("tags", {}).get("name:en") == "Lake Ladoga"]
if len(lakes) != 1:
    raise ValueError("Expected exactly one verified Lake Ladoga water relation")
lake = lakes[0]
water = to_map(lake_rings(lake, "outer").difference(lake_rings(lake, "inner")))
land = land.difference(water)

def polygons(geometry):
    if geometry.geom_type == "Polygon":
        yield geometry
    elif hasattr(geometry, "geoms"):
        for child in geometry.geoms:
            yield from polygons(child)

def encode_ring(ring):
    points = [(round(x, 2), round(y, 2)) for x, y in ring.coords[:-1]]
    if len(set(points)) < 3:
        return ""
    return "M" + "L".join(f"{x:g},{y:g}" for x, y in points) + "Z"

for feature in data["features"]:
    # Existing paths use even-odd fill, so symmetric difference also preserves holes.
    district = Polygon()
    for ring in feature["path"].split("Z"):
        if ring:
            coordinates = [tuple(map(float, point.split(","))) for point in ring[1:].split("L")]
            district = district.symmetric_difference(make_valid(Polygon(coordinates)))
    clipped = district.intersection(land)
    retained = [polygon for polygon in polygons(clipped) if polygon.area >= 0.01]
    if not retained:
        raise ValueError(f"Shoreline clipping removed all of {feature['name']}")
    geometry = unary_union(retained)
    x, y, right, bottom = geometry.bounds
    feature["bounds"] = [round(value, 2) for value in [x, y, right - x, bottom - y]]
    feature["path"] = "".join(encode_ring(polygon.exterior) + "".join(encode_ring(ring) for ring in polygon.interiors) for polygon in retained)

city = [feature["bounds"] for feature in data["features"] if feature["region"] == "spb"]
x, y = min(bounds[0] for bounds in city), min(bounds[1] for bounds in city)
data["cityBounds"] = [x, y, round(max(b[0] + b[2] for b in city) - x, 2), round(max(b[1] + b[3] for b in city) - y, 2)]
data["shoreline"] = {
    "seaSource": "https://osmdata.openstreetmap.de/download/simplified-land-polygons-complete-3857.zip",
    "lakeRelation": lake["id"],
    "lakeTimestamp": lake_source.get("osm3s", {}).get("timestamp_osm_base"),
    "projection": {"minX": min_x, "minY": min_y, "scale": scale},
}
args.map.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Clipped {len(data['features'])} districts to sea / Ladoga shorelines; {args.map.stat().st_size} bytes")
