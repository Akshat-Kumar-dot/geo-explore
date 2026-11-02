"""Export the Stage 1 inventory for the GeoExplore web app.

Writes src/data/fixtures/iron/belts.json with the three study belts, every Maus
polygon inside them (with its iron tag and nearest GEM mine) and the GEM iron
mines inside the belt boxes. Run build_iron_inventory.py first.
"""
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

from build_iron_inventory import BELTS, METRIC_CRS, RAW, belt_of

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "src" / "data" / "fixtures" / "iron" / "belts.json"

BELT_META = {
    "singhbhum_keonjhar": {"name": "Singhbhum–Keonjhar", "states": "Jharkhand & Odisha"},
    "bailadila": {"name": "Bailadila", "states": "Chhattisgarh"},
    "bellary_hospet_sandur": {"name": "Bellary–Hospet–Sandur", "states": "Karnataka"},
}


def iron_tag(r) -> str:
    for b in (0, 1, 2):
        if r[f"iron_{b}km"]:
            return f"{b}km"
    return "none"


def rounded(geom) -> list:
    return [[[round(x, 5), round(y, 5)] for x, y in geom.exterior.coords]]


def main() -> None:
    polys = gpd.read_file(PROCESSED / "belt_candidates.geojson")
    gem_xlsx = sorted((RAW / "gem").glob("*.xlsx"))[-1]
    sheet = pd.read_excel(gem_xlsx, sheet_name="Main Data")
    sheet = sheet[sheet["Country/area"] == "India"].copy()
    sheet[["lat", "lon"]] = sheet["Coordinates"].str.split(",", n=1, expand=True).astype(float)
    mines = gpd.GeoDataFrame(sheet, geometry=gpd.points_from_xy(sheet.lon, sheet.lat), crs=4326)
    mines["belt"] = mines.geometry.apply(belt_of)
    mines = mines[mines["belt"].notna()].reset_index(drop=True)

    polys_m, mines_m = polys.to_crs(METRIC_CRS), mines.to_crs(METRIC_CRS)
    near = gpd.sjoin_nearest(polys_m, mines_m[["GEM asset ID", "Asset name (English)", "geometry"]],
                             how="left", distance_col="d")
    near = near[~near.index.duplicated()]
    covered = gpd.sjoin_nearest(mines_m, polys_m[["geometry"]], how="left", distance_col="d")
    covered = covered[~covered.index.duplicated()]

    out_polys = []
    for i, r in polys.iterrows():
        out_polys.append({
            "poly_id": r["poly_id"], "belt": r["belt"],
            "area_ha": round(float(r["area_km2"]) * 100, 1),
            "iron_tag": iron_tag(r),
            "nearest_mine_id": near.at[i, "GEM asset ID"],
            "nearest_mine": near.at[i, "Asset name (English)"],
            "nearest_km": round(float(near.at[i, "d"]) / 1000, 2),
            "geometry": rounded(r.geometry.simplify(0.00003)),
        })

    num = lambda v: None if pd.isna(pd.to_numeric(v, errors="coerce")) else float(pd.to_numeric(v, errors="coerce"))
    out_mines = [{
        "mine_id": r["GEM asset ID"], "name": r["Asset name (English)"],
        "municipality": r["Municipality"] if pd.notna(r["Municipality"]) else "",
        "state": r["Subnational unit"], "belt": r["belt"],
        "lat": round(r.lat, 6), "lon": round(r.lon, 6),
        "status": r["Operating status"], "precision": r["Coordinate accuracy"],
        "capacity_ttpa": num(r["Design capacity (ttpa)"]),
        "production_2024_ttpa": num(r["Production 2024 (ttpa)"]),
        "wiki": r["GEM wiki page"] if pd.notna(r["GEM wiki page"]) else None,
        "nearest_polygon_km": round(float(covered.at[i, "d"]) / 1000, 2),
    } for i, r in mines.iterrows()]

    belts = [{"id": k, **BELT_META[k], "role": role, "bbox": list(bbox)} for k, (bbox, role) in BELTS.items()]
    data = {
        "sources": {
            "polygons": "Maus et al. 2022, Global-scale mining polygons v2, PANGAEA.942325 (CC BY-SA 4.0)",
            "mines": "Global Energy Monitor, Global Iron Ore Mines Tracker, September 2026 (V1) release (CC BY 4.0)",
        },
        "belts": belts, "polygons": out_polys, "mines": out_mines,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(out_polys)} polygons, {len(out_mines)} mines, "
          f"{OUT.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
