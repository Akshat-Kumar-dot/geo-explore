"""Build the manual-review workbook for the study-belt polygons (Stage 1).

Reads data/processed/ (run build_iron_inventory.py first) and writes
data/review/belt_polygon_review.xlsx with:
  Polygons       one row per belt polygon, context columns + blank review columns
  Uncovered      GEM belt mines with no Maus polygon within 2 km
  Instructions   what each review value means

Re-running keeps anything already typed into the review columns (matched on
poly_id), so the sheet can be regenerated after the pipeline changes.
"""
from pathlib import Path

import geopandas as gpd
import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

from build_iron_inventory import METRIC_CRS, belt_of

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "data" / "review" / "belt_polygon_review.xlsx"

NEAR_KM = 2
REVIEW_CHOICES = {
    "commodity": ["iron", "iron-manganese", "manganese", "other mine", "not a mine", "unsure"],
    "surface_type": ["pit/bench", "ore stockpile", "waste dump", "tailings", "plant", "mixed", "other"],
    "status": ["active", "inactive", "unsure"],
}
REVIEW_COLS = ["commodity", "surface_type", "status", "notes", "reviewer"]


def maps_link(lat: float, lon: float) -> str:
    return f"https://www.google.com/maps/@?api=1&map_action=map&center={lat:.6f},{lon:.6f}&zoom=16&basemap=satellite"


def build_rows() -> tuple[pd.DataFrame, pd.DataFrame]:
    polys = gpd.read_file(PROCESSED / "belt_candidates.geojson")
    pts = gpd.read_file(PROCESSED / "iron_points.geojson")
    gem = pts[pts["source"].str.startswith("gem:")].reset_index(drop=True)
    polys_m, gem_m = polys.to_crs(METRIC_CRS), gem.to_crs(METRIC_CRS)

    centre = polys.geometry.representative_point()
    polys["lat"], polys["lon"] = centre.y.round(6), centre.x.round(6)
    polys["area_ha"] = (polys["area_km2"] * 100).round(1)

    near = gpd.sjoin_nearest(polys_m, gem_m[["name", "precision", "status", "wiki", "geometry"]],
                             how="left", distance_col="d")
    near = near[~near.index.duplicated()]
    polys["gem_mine"] = near["name"]
    polys["gem_km"] = (near["d"] / 1000).round(2)
    polys["gem_precision"] = near["precision"]
    polys["gem_status"] = near["status"]
    polys["gem_wiki"] = near["wiki"]
    within = gpd.sjoin(polys_m, gem_m[["geometry"]], how="inner", predicate="dwithin", distance=NEAR_KM * 1000)
    polys[f"gem_mines_within_{NEAR_KM}km"] = within.groupby(level=0).size().reindex(polys.index, fill_value=0)
    polys["map"] = [maps_link(a, o) for a, o in zip(polys["lat"], polys["lon"])]

    for c in REVIEW_COLS:
        polys[c] = ""
    cols = ["poly_id", "belt", "belt_role", "area_ha", "lat", "lon", "iron_0km", "iron_1km", "iron_2km",
            "gem_mine", "gem_km", "gem_precision", "gem_status", f"gem_mines_within_{NEAR_KM}km",
            "map", "gem_wiki", *REVIEW_COLS]
    rows = polys[cols].sort_values(["belt", "gem_km", "poly_id"]).reset_index(drop=True)

    # GEM belt mines that no polygon covers: candidates for the Tang–Werner layer or hand digitising.
    gem["belt"] = gem.geometry.apply(belt_of)
    gem_belt = gem[gem["belt"].notna()]
    far = gpd.sjoin_nearest(gem_belt.to_crs(METRIC_CRS), polys_m[["geometry"]], how="left", distance_col="d")
    far = far[~far.index.duplicated()]
    gem_belt = gem_belt.assign(nearest_polygon_km=(far["d"] / 1000).round(1))
    gem_belt = gem_belt[gem_belt["nearest_polygon_km"] > NEAR_KM]
    uncovered = pd.DataFrame({
        "gem_mine": gem_belt["name"], "belt": gem_belt["belt"], "status": gem_belt["status"],
        "precision": gem_belt["precision"], "nearest_polygon_km": gem_belt["nearest_polygon_km"],
        "lat": gem_belt.geometry.y.round(6), "lon": gem_belt.geometry.x.round(6),
        "map": [maps_link(p.y, p.x) for p in gem_belt.geometry], "gem_wiki": gem_belt["wiki"],
        "action": "", "notes": "",
    }).sort_values(["belt", "nearest_polygon_km"])
    return rows, uncovered


def carry_over(rows: pd.DataFrame) -> pd.DataFrame:
    if not OUT.exists():
        return rows
    old = pd.read_excel(OUT, sheet_name="Polygons", dtype=str).fillna("")
    old = old.set_index("poly_id")[REVIEW_COLS]
    kept = rows["poly_id"].map(lambda p: p in old.index)
    for c in REVIEW_COLS:
        rows.loc[kept, c] = rows.loc[kept, "poly_id"].map(old[c])
    print(f"Kept existing review entries for {int(kept.sum())} polygons")
    return rows


INSTRUCTIONS = [
    ("Goal", "Check every polygon in the Polygons sheet on satellite imagery and fill the five review columns."),
    ("map", "Opens Google satellite view at the polygon. Compare with the 2019 Sentinel-2 mosaic (s2maps.eu) "
            "if the mine has changed since the polygons were digitised."),
    ("iron_0/1/2km", "TRUE if a GEM iron-mine point lies within that distance (approximate GEM points get +3 km). "
                     "A hint, not a label: manganese mines near Joda and Barbil sit close to iron points."),
    ("commodity", "iron | iron-manganese | manganese | other mine | not a mine | unsure"),
    ("surface_type", "pit/bench | ore stockpile | waste dump | tailings | plant | mixed | other. "
                     "Pits, benches and stockpiles form the iron-ore surface class."),
    ("status", "active (bare surface grew or changed) | inactive (revegetated) | unsure"),
    ("gem_wiki", "GEM mine page; it links the IBM inspection report with pit coordinates, areas and grades. "
                 "Read coordinates by hand: the UTM zone is not printed and digits are sometimes missing."),
    ("Uncovered sheet", "GEM mines in the belts with no polygon within 2 km. Record in 'action' whether to "
                        "digitise, take from Tang–Werner, or drop (e.g. proposed mine, nothing on the ground)."),
    ("Re-running", "python pipeline/make_review_sheet.py keeps everything typed in the review columns."),
]


def style(path: Path, n_rows: int) -> None:
    wb = load_workbook(path)
    head = PatternFill("solid", fgColor="1F3A4D")
    review = PatternFill("solid", fgColor="FFF4D6")
    for ws in wb.worksheets:
        for cell in ws[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = head
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.freeze_panes = "B2" if ws.title != "Instructions" else None
        for col in ws.columns:
            width = max(len(str(c.value or "")) for c in col[:50])
            ws.column_dimensions[col[0].column_letter].width = min(max(width, 8) + 2, 60)
        if ws.title != "Instructions":
            ws.auto_filter.ref = ws.dimensions
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                if isinstance(cell.value, str) and cell.value.startswith("https://"):
                    label = "map" if "google.com/maps" in cell.value else "GEM page"
                    cell.hyperlink, cell.value, cell.style = cell.value, label, "Hyperlink"

    ws = wb["Polygons"]
    header = {c.value: c.column_letter for c in ws[1]}
    for c in REVIEW_COLS:
        ws[f"{header[c]}1"].fill = PatternFill("solid", fgColor="B7791F")
        for r in range(2, n_rows + 2):
            ws[f"{header[c]}{r}"].fill = review
    for c, choices in REVIEW_CHOICES.items():
        dv = DataValidation(type="list", formula1='"' + ",".join(choices) + '"', allow_blank=True)
        dv.add(f"{header[c]}2:{header[c]}{n_rows + 1}")
        ws.add_data_validation(dv)
    wb["Instructions"].column_dimensions["B"].width = 110
    for row in wb["Instructions"].iter_rows(min_row=2):
        row[1].alignment = Alignment(wrap_text=True, vertical="top")
    wb.save(path)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    rows, uncovered = build_rows()
    rows = carry_over(rows)
    with pd.ExcelWriter(OUT, engine="openpyxl") as xw:
        rows.to_excel(xw, sheet_name="Polygons", index=False)
        uncovered.to_excel(xw, sheet_name="Uncovered", index=False)
        pd.DataFrame(INSTRUCTIONS, columns=["Item", "Meaning"]).to_excel(xw, sheet_name="Instructions", index=False)
    style(OUT, len(rows))
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(rows)} polygons, {len(uncovered)} uncovered GEM mines")
    print(rows.groupby("belt").size().to_string())


if __name__ == "__main__":
    main()
