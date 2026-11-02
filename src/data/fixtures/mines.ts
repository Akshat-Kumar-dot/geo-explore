import type { Belt, Mine } from '../../types';
import data from './iron/belts.json';

/* Real Stage 1 data, exported by pipeline/export_app_data.py:
   Maus et al. 2022 mining polygons and GEM's Global Iron Ore Mines Tracker. */

export const BELTS = data.belts as Belt[];
export const BELT_NAME: Record<string, string> = Object.fromEntries(BELTS.map((b) => [b.id, b.name]));
export const DATA_SOURCES = data.sources;
export const BELT_POLYGONS = data.polygons;

/** GEM iron mines inside the three study belts. Real names, real locations. */
export const IRON_MINES: Mine[] = data.mines.map((m) => {
  const ttpa = m.capacity_ttpa ?? m.production_2024_ttpa ?? null;
  return {
    mine_id: m.mine_id,
    name: m.name,
    district: m.municipality,
    state: m.state,
    belt: m.belt,
    lat: m.lat,
    lon: m.lon,
    mine_type: 'OC',
    depth_m: null,
    nominal_capacity_tpd: ttpa ? Math.round((ttpa * 1000) / 365) : 0,
    capacity_ttpa: m.capacity_ttpa,
    status: m.status,
    coordinate_accuracy: m.precision,
    nearest_polygon_km: m.nearest_polygon_km,
    wiki: m.wiki,
  };
});

/** The mines the production-plan screen models: the largest operating mines per belt. */
const PLAN_PER_BELT: Record<string, number> = { singhbhum_keonjhar: 5, bailadila: 3, bellary_hospet_sandur: 2 };
export const PLAN_MINES: Mine[] = BELTS.flatMap((b) =>
  IRON_MINES
    .filter((m) => m.belt === b.id && m.status === 'operating' && m.capacity_ttpa)
    .sort((a, z) => (z.capacity_ttpa ?? 0) - (a.capacity_ttpa ?? 0))
    .slice(0, PLAN_PER_BELT[b.id] ?? 0));

export const REGION_ID = 'india_iron_belts';
/** Opening view: the Singhbhum–Keonjhar belt, where most of the polygons are. */
export const AOI_BBOX = BELTS[0].bbox;
