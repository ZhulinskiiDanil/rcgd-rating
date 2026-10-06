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

To regenerate from the downloaded JSON response:

```sh
node scripts/build-district-map.mjs path/to/overpass.json
```

The generator projects coordinates to Web Mercator, simplifies each shared OSM way once at 0.25 units in the 1000-unit-wide overview, assembles closed outer and inner rings and emits compound SVG paths with even-odd filling. Shared boundaries therefore retain the same simplified vertices. Small rings that collapse to fewer than three unique points are omitted. Boundaries include administrative water areas from OSM, not just shorelines. This is a community ranking map, not a cadastral or navigation map.

Only this derived geographic dataset is licensed under ODbL; the license does not change the licensing of the surrounding application code.
