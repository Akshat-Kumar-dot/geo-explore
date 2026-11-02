"""Stage 1: build an Indian iron-mine polygon inventory.

Inputs (data/raw/):
  global_mining_polygons_v2.gpkg        Maus et al. 2022, PANGAEA.942325 (CC BY-SA 4.0)
  gem/*.xlsx                            Global Energy Monitor, Global Iron Ore Mines
                                        Tracker, Sept 2026 (V1) (CC BY 4.0); main
                                        iron-point source
  mine_production/data/facilities.gpkg  Jasansky et al. 2023, Zenodo 7369478 (CC BY 4.0)
  iron_points_extra.csv  (optional)     mines still missing after the join:
                                        name,lat,lon,source[,precision]

Outputs (data/processed/):
  india_mining_polygons.geojson   every Indian polygon, with belt + iron tags
  iron_points.geojson             the iron-mine points used for tagging
  belt_candidates.geojson         polygons inside the three study belts
  summary.txt                     counts per belt and per buffer

A polygon is tagged iron at buffer b if an iron point lies within b km of it
(b = 0, 1, 2 km, as in the synopsis). Points whose coordinates GEM marks as
approximate get APPROX_EXTRA_KM added to every buffer. The polygons themselves have no
commodity attribute, so belt membership is kept as a separate column for
manual review rather than treated as an iron label.
"""
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"

# Generous boxes around each belt (lon_min, lat_min, lon_max, lat_max).
BELTS = {
    "singhbhum_keonjhar": ((84.9, 21.3, 86.0, 22.6), "train"),  # Noamundi, Joda, Gua, Barbil
    "bailadila": ((80.9, 18.3, 81.6, 19.1), "train"),           # Bacheli, Kirandul
    "bellary_hospet_sandur": ((76.0, 14.6, 77.1, 15.5), "test"),  # Sandur
}
BUFFERS_KM = [0, 1, 2]
APPROX_EXTRA_KM = 3
# Large belt mines that must appear among the points; gaps go to iron_points_extra.csv.
KEY_MINES = ["Noamundi", "Kiriburu", "Meghahatuburu", "Bacheli", "Kirandul", "Donimalai", "Kumaraswamy"]
METRIC_CRS = 7755  # WGS 84 / India NSF LCC, metres


def _col(df: pd.DataFrame, *needles: str) -> str | None:
    """First column whose lower-cased name contains every needle."""
    for c in df.columns:
        if all(n in str(c).lower() for n in needles):
            return c
    return None


def load_gem_points() -> gpd.GeoDataFrame | None:
    files = sorted((RAW / "gem").glob("*.xlsx"))
    if not files:
        return None
    for sheet in pd.read_excel(files[-1], sheet_name=None).values():
        lat, lon = _col(sheet, "latitude"), _col(sheet, "longitude")
        coords = _col(sheet, "coordinates")
        if lat and lon:
            break
        if coords:
            # GIOMT V1 stores "lat, lon" in a single Coordinates column.
            sheet[["_lat", "_lon"]] = sheet[coords].astype(str).str.split(",", n=1, expand=True)
            sheet[["_lat", "_lon"]] = sheet[["_lat", "_lon"]].apply(pd.to_numeric, errors="coerce")
            lat, lon = "_lat", "_lon"
            break
    else:
        raise ValueError(f"No sheet with coordinate columns in {files[-1].name}")

    country = _col(sheet, "country")
    if country:
        sheet = sheet[sheet[country].astype(str).str.strip() == "India"]
    name = _col(sheet, "asset name") or _col(sheet, "mine name") or _col(sheet, "name")
    asset_id = _col(sheet, "gem", "id") or _col(sheet, "asset id")
    accuracy = _col(sheet, "accuracy") or _col(sheet, "precision")
    status = _col(sheet, "status")
    wiki = _col(sheet, "wiki")

    sheet = sheet.dropna(subset=[lat, lon])
    precision = (
        sheet[accuracy].astype(str).str.lower().map(lambda s: "exact" if "exact" in s else "approximate")
        if accuracy else "approximate"
    )
    return gpd.GeoDataFrame(
        {
            "name": sheet[name] if name else "",
            "source": "gem:" + (sheet[asset_id].astype(str) if asset_id else files[-1].name),
            "precision": precision,
            "status": sheet[status] if status else None,
            "wiki": sheet[wiki] if wiki else None,
        },
        geometry=gpd.points_from_xy(sheet[lon].astype(float), sheet[lat].astype(float)),
        crs=4326,
    )


def load_jasansky_points() -> gpd.GeoDataFrame:
    fac = gpd.read_file(RAW / "mine_production" / "data" / "facilities.gpkg")
    fac = fac[(fac["GID_0"] == "IND") | fac["country"].fillna("").str.contains("India")]
    is_iron = (fac["primary_commodity"] == "Iron") | fac["commodities_products"].fillna("").str.contains(
        "Iron ore", case=False
    )
    fac = fac[is_iron & ~fac.geometry.isna() & ~fac.geometry.is_empty]
    return gpd.GeoDataFrame(
        {"name": fac["facility_name"], "source": "jasansky2023:" + fac["facility_id"], "precision": "unknown"},
        geometry=fac.geometry.representative_point(),
        crs=fac.crs,
    ).to_crs(4326)


def load_iron_points() -> gpd.GeoDataFrame:
    parts = [p for p in (load_gem_points(), load_jasansky_points()) if p is not None]
    extra = RAW / "iron_points_extra.csv"
    if extra.exists():
        df = pd.read_csv(extra)
        df["precision"] = df.get("precision", "approximate")
        parts.append(gpd.GeoDataFrame(df[["name", "source", "precision"]],
                                      geometry=gpd.points_from_xy(df.lon, df.lat), crs=4326))
    pts = pd.concat(parts, ignore_index=True)
    return pts[pts.geometry.is_valid & ~pts.geometry.is_empty].reset_index(drop=True)


def tag_within(polys_m: gpd.GeoDataFrame, pts_m: gpd.GeoDataFrame, km: float) -> pd.Series:
    """True where a point lies within km of the polygon (km + APPROX_EXTRA_KM for approximate points)."""
    hit = pd.Index([])
    for approx, grp in pts_m.groupby(pts_m["precision"] == "approximate"):
        d = (km + (APPROX_EXTRA_KM if approx else 0)) * 1000
        hit = hit.union(gpd.sjoin(polys_m, grp, how="inner", predicate="dwithin", distance=d).index)
    return polys_m.index.isin(hit)


def belt_of(geom) -> str | None:
    c = geom.representative_point()
    for name, ((x0, y0, x1, y1), _) in BELTS.items():
        if x0 <= c.x <= x1 and y0 <= c.y <= y1:
            return name
    return None


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    polys = gpd.read_file(RAW / "global_mining_polygons_v2.gpkg", where="ISO3_CODE = 'IND'").to_crs(4326)
    polys = polys.rename(columns={"AREA": "area_km2"})
    polys["poly_id"] = polys.index.map(lambda i: f"IND{i:05d}")
    polys["belt"] = polys.geometry.apply(belt_of)
    polys["belt_role"] = polys["belt"].map({k: v[1] for k, v in BELTS.items()})

    pts = load_iron_points()
    polys_m, pts_m = polys.to_crs(METRIC_CRS), pts.to_crs(METRIC_CRS)
    for b in BUFFERS_KM:
        polys[f"iron_{b}km"] = tag_within(polys_m, pts_m, b)
    nearest = gpd.sjoin_nearest(polys_m, pts_m[["name", "geometry"]], how="left", distance_col="d")
    nearest = nearest[~nearest.index.duplicated()]
    polys["nearest_iron_point"] = nearest["name"]
    polys["nearest_iron_km"] = (nearest["d"] / 1000).round(2)

    keep = ["poly_id", "area_km2", "belt", "belt_role", *[f"iron_{b}km" for b in BUFFERS_KM],
            "nearest_iron_point", "nearest_iron_km", "geometry"]
    polys = polys[keep]
    polys.to_file(OUT / "india_mining_polygons.geojson", driver="GeoJSON")
    polys[polys["belt"].notna()].to_file(OUT / "belt_candidates.geojson", driver="GeoJSON")
    pts.to_file(OUT / "iron_points.geojson", driver="GeoJSON")

    lines = [
        f"Indian polygons: {len(polys)}  ({polys.area_km2.sum():.1f} km2)",
        f"Iron points used: {len(pts)}",
        *[f"  {src}: {n} ({', '.join(f'{p}={c}' for p, c in grp['precision'].value_counts().items())})"
          for src, grp in pts.groupby(pts["source"].str.split(":").str[0]) for n in [len(grp)]],
        "",
        "Key mines (missing ones belong in iron_points_extra.csv):",
        *[f"  {m}: {'found' if pts['name'].astype(str).str.contains(m, case=False).any() else 'MISSING'}"
          for m in KEY_MINES],
        "",
        "Tagged iron by buffer (all India):",
        *[f"  {b} km: {int(polys[f'iron_{b}km'].sum())}" for b in BUFFERS_KM],
        "",
        "Per belt:",
    ]
    for name, (_, role) in BELTS.items():
        sub = polys[polys["belt"] == name]
        tags = ", ".join(f"{b}km={int(sub[f'iron_{b}km'].sum())}" for b in BUFFERS_KM)
        lines.append(f"  {name} ({role}): {len(sub)} polygons, {sub.area_km2.sum():.1f} km2; iron-tagged {tags}")
    summary = "\n".join(lines)
    (OUT / "summary.txt").write_text(summary + "\n", encoding="utf-8")
    print(summary)


if __name__ == "__main__":
    main()
