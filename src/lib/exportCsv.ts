import type { Zone } from '../types';

function download(name: string, body: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

/** Ranked target export. Marks every synthetic column and carries no grade/tonnage columns. */
export function exportZonesCsv(zones: Zone[]) {
  const rows = [...zones].sort((a, b) => a.rank - b.rank).map((z) => ({
    zone_id: z.zone_id,
    belt: z.belt,
    rank: z.rank,
    iron_tag: z.iron_tag,
    nearest_gem_mine: z.nearest_mine,
    dist_to_mine_km_context_only: z.dist_to_mine_km,
    area_ha: z.area_ha,
    centroid_lon: z.centroid[0],
    centroid_lat: z.centroid[1],
    synthetic_model_score_mean: z.score_mean,
    synthetic_model_score_max: z.score_max,
    synthetic_land_use_flag: z.land_use_flag,
    synthetic_dist_to_road_km: z.dist_to_road_km,
    synthetic_top_drivers: z.top_features.map((f) => `${f.name}:${f.contribution}`).join(' '),
  }));
  const header =
    '# GeoExplore ranked iron-ore targets - Singhbhum-Keonjhar, Bailadila, Bellary-Hospet-Sandur\n' +
    '# REAL: polygons (Maus et al. 2022, CC BY-SA 4.0), area, belt, iron tag and nearest mine\n' +
    '#   (Global Energy Monitor, Global Iron Ore Mines Tracker, Sept 2026 V1, CC BY 4.0).\n' +
    '# SYNTHETIC: columns prefixed synthetic_ (placeholders until the Stage 2 detector is trained).\n' +
    '# Scores are iron-ore surface probabilities, not Fe grade or tonnage estimates.\n' +
    '# dist_to_mine_km is logistics context and is excluded from the model features.\n';
  download(`geoexplore-targets-${new Date().toISOString().slice(0, 10)}.csv`, header + toCsv(rows));
}

export function exportRowsCsv(name: string, rows: Array<Record<string, unknown>>, note?: string) {
  download(name, (note ? `# ${note}\n` : '') + toCsv(rows));
}
