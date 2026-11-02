"""Render the Stage 1 result as a standalone map: data/review/iron_inventory_map.html.

Shows every Indian Maus polygon coloured by iron tag, the GEM and Jasansky iron
points, the three study-belt boxes and the GEM belt mines no polygon covers.
The GeoJSON is inlined, so the file opens straight from disk.
"""
import json
from pathlib import Path

import geopandas as gpd

from build_iron_inventory import BELTS, METRIC_CRS, belt_of

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "data" / "review" / "iron_inventory_map.html"


def tag_class(r) -> str:
    for b in (0, 1, 2):
        if r[f"iron_{b}km"]:
            return f"iron_{b}km"
    return "untagged"


def main() -> None:
    polys = gpd.read_file(PROCESSED / "india_mining_polygons.geojson")
    pts = gpd.read_file(PROCESSED / "iron_points.geojson")
    polys["tag"] = polys.apply(tag_class, axis=1)
    polys["geometry"] = polys.geometry.simplify(0.00005)

    pts["belt"] = pts.geometry.apply(belt_of)
    near = gpd.sjoin_nearest(pts.to_crs(METRIC_CRS), polys.to_crs(METRIC_CRS)[["geometry"]],
                             how="left", distance_col="d")
    near = near[~near.index.duplicated()]
    pts["poly_km"] = (near["d"] / 1000).round(1)
    pts["uncovered"] = pts["belt"].notna() & (pts["poly_km"] > 2)
    pts["src"] = pts["source"].str.split(":").str[0]

    belts = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"name": k, "role": role},
             "geometry": {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}}
            for k, ((x0, y0, x1, y1), role) in BELTS.items()
        ],
    }
    stats = {}
    for k in BELTS:
        sub = polys[polys["belt"] == k]
        g = pts[(pts["belt"] == k) & (pts["src"] == "gem")]
        stats[k] = {
            "polygons": len(sub), "area": round(float(sub["area_km2"].sum()), 1),
            **{f"iron_{b}km": int(sub[f"iron_{b}km"].sum()) for b in (0, 1, 2)},
            "gem": len(g), "uncovered": int(g["uncovered"].sum()),
        }

    keep_p = ["poly_id", "area_km2", "belt", "tag", "nearest_iron_point", "nearest_iron_km", "geometry"]
    keep_t = ["name", "src", "precision", "status", "wiki", "belt", "poly_km", "uncovered", "geometry"]
    html = (TEMPLATE
            .replace("__POLYS__", polys[keep_p].to_json(drop_id=True))
            .replace("__POINTS__", pts[keep_t].to_json(drop_id=True))
            .replace("__BELTS__", json.dumps(belts))
            .replace("__STATS__", json.dumps(stats))
            .replace("__NPOLY__", str(len(polys)))
            .replace("__NGEM__", str(int((pts["src"] == "gem").sum()))))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")


TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Iron Mine Inventory</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>
  :root { --bg:#f7f6f2; --panel:#ffffff; --ink:#1d2830; --muted:#5d6b75; --line:#dfe3e6;
          --t0:#b42318; --t1:#ea7a1a; --t2:#f2c94c; --un:#8a96a0; --gem:#1565c0; --unc:#d4145a; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
          --bg:#14191d; --panel:#1d252b; --ink:#e7ecef; --muted:#9aa7b0; --line:#2e3a42; } }
  :root[data-theme="dark"] { --bg:#14191d; --panel:#1d252b; --ink:#e7ecef; --muted:#9aa7b0; --line:#2e3a42; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--ink);
               font:14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
  #map { position:absolute; inset:0; }
  .panel { position:absolute; top:12px; left:12px; width:330px; max-height:calc(100% - 24px); overflow:auto;
           background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px 16px;
           box-shadow:0 4px 18px rgba(0,0,0,.18); box-sizing:border-box; }
  h1 { font-size:16px; margin:0 0 2px; } .sub { color:var(--muted); font-size:12px; margin-bottom:10px; }
  .belts button { display:block; width:100%; text-align:left; margin:0 0 8px; padding:8px 10px; cursor:pointer;
                  background:transparent; color:var(--ink); border:1px solid var(--line); border-radius:8px; font:inherit; }
  .belts button:hover { border-color:var(--gem); }
  .belts b { font-size:13px; } .role { color:var(--muted); font-size:11px; text-transform:uppercase; margin-left:4px; }
  .bar { display:flex; height:8px; border-radius:4px; overflow:hidden; margin:6px 0 4px; background:var(--line); }
  .nums { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
  .legend { margin-top:10px; font-size:12px; } .legend div { display:flex; align-items:center; gap:8px; margin:3px 0; }
  .sw { width:14px; height:14px; border-radius:3px; flex:none; } .dot { width:10px; height:10px; border-radius:50%; flex:none; }
  .toggles { margin-top:10px; font-size:12px; } .toggles label { display:block; margin:3px 0; cursor:pointer; }
  .maplibregl-popup-content { background:var(--panel); color:var(--ink); font-size:12px; border-radius:8px; }
  .maplibregl-popup-tip { border-top-color:var(--panel) !important; border-bottom-color:var(--panel) !important; }
  .maplibregl-popup-content a { color:var(--gem); }
  @media (max-width:600px) { .panel { left:8px; right:8px; width:auto; top:auto; bottom:8px; max-height:45%; } }
</style>
</head>
<body>
<div id="map"></div>
<div class="panel">
  <h1>Indian iron-mine inventory, Stage 1</h1>
  <div class="sub">__NPOLY__ Maus polygons in India, tagged against __NGEM__ GEM iron mines. Click a belt to zoom.</div>
  <div class="belts" id="belts"></div>
  <div class="legend">
    <div><span class="sw" style="background:var(--t0)"></span>Iron point inside polygon (0 km)</div>
    <div><span class="sw" style="background:var(--t1)"></span>Iron point within 1 km</div>
    <div><span class="sw" style="background:var(--t2)"></span>Iron point within 2 km</div>
    <div><span class="sw" style="background:var(--un)"></span>No iron point within 2 km</div>
    <div><span class="dot" style="background:var(--gem);border:2px solid #fff"></span>GEM mine, exact coordinates</div>
    <div><span class="dot" style="border:2px solid var(--gem)"></span>GEM mine, approximate coordinates</div>
    <div><span class="dot" style="background:var(--unc);border:2px solid #fff"></span>Belt mine with no polygon within 2 km</div>
  </div>
  <div class="toggles">
    <label><input type="checkbox" id="satellite" checked> Satellite basemap</label>
    <label><input type="checkbox" id="untagged" checked> Show untagged polygons</label>
  </div>
  <div class="sub" style="margin-top:10px">Approximate GEM points use buffers 3 km wider. Polygons: Maus et al. 2022 (CC BY-SA 4.0).
  Mines: Global Energy Monitor, Global Iron Ore Mines Tracker, Sept 2026 (V1) (CC BY 4.0).</div>
</div>
<script>
const POLYS = __POLYS__, POINTS = __POINTS__, BELTS = __BELTS__, STATS = __STATS__;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const LABEL = { singhbhum_keonjhar: "Singhbhum–Keonjhar", bailadila: "Bailadila", bellary_hospet_sandur: "Bellary–Hospet–Sandur" };

const map = new maplibregl.Map({
  container: "map", center: [80.5, 19.5], zoom: 4.6, attributionControl: { compact: true },
  style: { version: 8, sources: {
      sat: { type: "raster", tileSize: 256, maxzoom: 18,
             tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
             attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
      osm: { type: "raster", tileSize: 256, maxzoom: 19,
             tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], attribution: "© OpenStreetMap contributors" } },
    layers: [{ id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } },
             { id: "sat", type: "raster", source: "sat" }] }
});
map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.ScaleControl(), "bottom-right");

map.on("load", () => {
  const colour = ["match", ["get", "tag"], "iron_0km", css("--t0"), "iron_1km", css("--t1"), "iron_2km", css("--t2"), css("--un")];
  map.addSource("belts", { type: "geojson", data: BELTS });
  map.addSource("polys", { type: "geojson", data: POLYS });
  map.addSource("pts", { type: "geojson", data: POINTS });
  map.addLayer({ id: "belt-line", type: "line", source: "belts", paint: { "line-color": "#ffffff", "line-width": 1.5, "line-dasharray": [3, 2] } });
  map.addLayer({ id: "poly-fill", type: "fill", source: "polys", paint: { "fill-color": colour, "fill-opacity": 0.55 } });
  map.addLayer({ id: "poly-line", type: "line", source: "polys", paint: { "line-color": colour, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 12, 2] } });
  map.addLayer({ id: "pts", type: "circle", source: "pts", filter: ["==", ["get", "src"], "gem"], paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 12, 6],
      "circle-color": ["case", ["get", "uncovered"], css("--unc"), ["==", ["get", "precision"], "exact"], css("--gem"), "rgba(0,0,0,0)"],
      "circle-stroke-color": ["case", ["get", "uncovered"], "#fff", ["==", ["get", "precision"], "exact"], "#fff", css("--gem")],
      "circle-stroke-width": ["case", ["==", ["get", "precision"], "exact"], 1, 2] } });

  const fmt = (v, d = 2) => v == null ? "–" : Number(v).toFixed(d);
  map.on("click", "pts", e => {
    const p = e.features[0].properties;
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML(
      `<b>${p.name}</b><br>${p.status} · ${p.precision} coordinates<br>` +
      `Nearest polygon: ${fmt(p.poly_km, 1)} km${p.uncovered === true || p.uncovered === "true" ? " <b>(not covered)</b>" : ""}<br>` +
      (p.wiki && p.wiki !== "null" ? `<a href="${p.wiki}" target="_blank" rel="noopener">GEM page</a>` : "")).addTo(map);
  });
  map.on("click", "poly-fill", e => {
    if (map.queryRenderedFeatures(e.point, { layers: ["pts"] }).length) return;
    const p = e.features[0].properties;
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML(
      `<b>${p.poly_id}</b> · ${fmt(p.area_km2 * 100, 1)} ha<br>${p.tag.replace("_", " ").replace("iron", "iron within")}` +
      `<br>Nearest iron point: ${p.nearest_iron_point} (${fmt(p.nearest_iron_km)} km)` +
      (p.belt && p.belt !== "null" ? `<br>Belt: ${LABEL[p.belt]}` : "")).addTo(map);
  });
  for (const l of ["pts", "poly-fill"]) {
    map.on("mouseenter", l, () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", l, () => map.getCanvas().style.cursor = "");
  }
});

const box = document.getElementById("belts");
for (const f of BELTS.features) {
  const k = f.properties.name, s = STATS[k], n = s.polygons || 1;
  const seg = (v, c) => `<span style="width:${100 * v / n}%;background:var(${c})"></span>`;
  const b = document.createElement("button");
  b.innerHTML = `<b>${LABEL[k]}</b><span class="role">${f.properties.role}</span>
    <div class="bar">${seg(s.iron_0km, "--t0")}${seg(s.iron_1km - s.iron_0km, "--t1")}${seg(s.iron_2km - s.iron_1km, "--t2")}${seg(s.polygons - s.iron_2km, "--un")}</div>
    <div class="nums">${s.polygons} polygons · ${s.area} km² · iron-tagged ${s.iron_0km} / ${s.iron_1km} / ${s.iron_2km} at 0 / 1 / 2 km<br>
    ${s.gem} GEM mines · ${s.uncovered} with no polygon within 2 km</div>`;
  const [x0, y0] = f.geometry.coordinates[0][0], [x1, y1] = f.geometry.coordinates[0][2];
  b.onclick = () => map.fitBounds([[x0, y0], [x1, y1]], {
    padding: innerWidth > 600 ? { top: 30, bottom: 30, right: 60, left: 370 } : 30 });
  box.appendChild(b);
}
document.getElementById("satellite").onchange = e => {
  map.setLayoutProperty("sat", "visibility", e.target.checked ? "visible" : "none");
  map.setLayoutProperty("osm", "visibility", e.target.checked ? "none" : "visible");
};
document.getElementById("untagged").onchange = e => {
  const f = e.target.checked ? null : ["!=", ["get", "tag"], "untagged"];
  map.setFilter("poly-fill", f); map.setFilter("poly-line", f);
};
</script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
