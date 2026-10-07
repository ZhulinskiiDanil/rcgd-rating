# District map data

`districts.json` contains simplified real administrative boundaries from **OpenStreetMap contributors**, under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The map displays [OpenStreetMap attribution](https://www.openstreetmap.org/copyright) and links to the downloadable derived data.

The 18 Saint Petersburg districts are direct administrative-level-5 children of [relation 337422](https://www.openstreetmap.org/relation/337422). The 18 Leningrad Oblast districts / municipal and urban okrugs are administrative-level-6 children of [relation 176095](https://www.openstreetmap.org/relation/176095). Names are matched to application districts by region and district name, not database IDs. City and oblast districts with the same name remain separate.

Source retrieved on 2026-10-06 using the public [Overpass API](https://overpass-api.de/). Exact OSM snapshot timestamp is included in the JSON. Query (POST form field `data` to `https://overpass-api.de/api/interpreter`):

```text
[out:json][timeout:90];
rel(337422)->.spb;
rel(176095)->.lo;
(
  rel(r.spb)["admin_level"="5"];
  rel(r.lo)["admin_level"="6"];
);
out geom;
```

The Gulf of Finland is clipped to real sea shorelines from the OSM-derived [simplified land polygons in EPSG:3857](https://osmdata.openstreetmap.de/data/land-polygons.html). Lake Ladoga is subtracted using its complete water multipolygon (including island holes), currently [relation 21149039](https://www.openstreetmap.org/relation/21149039). Coastlines and lake data were retrieved on 2026-10-07. The lake snapshot timestamp and source URL are recorded in `districts.json`. Lake query:

```text
[out:json][timeout:90];
rel["name:en"="Lake Ladoga"]["natural"="water"];
out geom;
```

To regenerate from the downloaded JSON responses and [land polygon ZIP](https://osmdata.openstreetmap.de/download/simplified-land-polygons-complete-3857.zip):

```sh
node scripts/build-district-map.mjs path/to/overpass.json
python -m pip install shapely pyshp
python scripts/clip-district-map.py path/to/overpass.json path/to/simplified-land-polygons-complete-3857.zip path/to/ladoga-overpass.json
```

The first generator projects coordinates to Web Mercator, simplifies each shared OSM way once at 0.25 units in the 1000-unit-wide overview, assembles closed outer and inner rings and emits compound SVG paths with even-odd filling. The second intersects these geometries with sea land polygons and subtracts Lake Ladoga water, preserving islands. Water is removed from the actual interactive paths, not covered by a decorative overlay. Shared inland boundaries therefore retain the same vertices. Features smaller than 0.01 square map units and rings collapsing to fewer than three unique points are omitted. The Python dependencies are needed only to regenerate data, not to run or build the Nuxt application. This is a community ranking map, not a cadastral or navigation map.

Only this derived geographic dataset is licensed under ODbL; the license does not change the licensing of the surrounding application code.

The display names retain the full “Гатчинский муниципальный округ” and “Сосновоборский городской округ”. The original OSM names remain in `sourceName`. The client revalidates the geometry on page navigation and refits the viewport when geometry arrives; district profiles initially focus their district.
