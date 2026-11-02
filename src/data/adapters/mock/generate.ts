import type {
  Zone, ZoneDriver, LandUseFlag, Occurrence, Provenance,
  ProductionRecord, Forecast, Recommendation, Mine, IronTag,
} from '../../../types';
import { IRON_MINES, PLAN_MINES, BELT_POLYGONS, REGION_ID } from '../../fixtures/mines';
import { mulberry32, gauss, clamp, weibull, hashSeed } from '../../../lib/rng';

/* ------------------------------------------------------------------ *
 * Zones are the REAL Maus mining polygons in the three iron belts, with
 * their real area, iron tag and nearest GEM mine. The model score, its
 * SHAP drivers, road distance, land use and all production figures are
 * SYNTHETIC — seeded so the demo is identical on every run, and labelled
 * as such everywhere they surface — until the Stage 2 detector is trained.
 * ------------------------------------------------------------------ */

/** Sentinel-2 features the Stage 2 detector uses (synopsis, Section VI-B). */
const FEATURES = [
  'fe_band_depth', 'fe3_ratio', 'ferrous', 'fe_oxide_swir', 'clay', 'ndvi_dry',
  'bsi', 'bare_change', 'slope', 'elevation', 'texture', 'pc1',
] as const;

/** Broad prior on which features matter, so SHAP sets look mineralogically sane. */
const FEATURE_PRIOR: Record<string, number> = {
  fe_band_depth: 1.00, fe3_ratio: 0.92, fe_oxide_swir: 0.80, bare_change: 0.70,
  ferrous: 0.62, bsi: 0.58, ndvi_dry: 0.54, texture: 0.48, slope: 0.44,
  clay: 0.40, elevation: 0.32, pc1: 0.28,
};

/** Synthetic score band per iron tag: a polygon with a GEM iron mine inside it scores highest. */
const TAG_BAND: Record<IronTag, [number, number]> = {
  '0km': [0.74, 0.21], '1km': [0.66, 0.20], '2km': [0.60, 0.18], none: [0.55, 0.15],
};

const km = (v: number) => Math.round(v * 10) / 10;

/** Area-weighted centroid of a ring; falls back to the vertex mean for degenerate rings. */
function centroidOf(ring: number[][]): [number, number] {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [+(cx / (3 * a)).toFixed(5), +(cy / (3 * a)).toFixed(5)];
}

/** Irregular blob polygon around a centroid — reads as a real map unit. */
function blob(rnd: () => number, lon: number, lat: number, radiusKm: number): GeoJSON.Polygon {
  const n = 11 + Math.floor(rnd() * 4);
  const ring: [number, number][] = [];
  const phase = rnd() * Math.PI * 2;
  const stretch = 0.6 + rnd() * 0.9;         // elongation, belts are linear
  const bearing = rnd() * Math.PI;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = radiusKm * (0.66 + 0.34 * (0.5 + 0.5 * Math.sin(3 * t + phase)) + gauss(rnd, 0, 0.07));
    let dx = r * Math.cos(t), dy = r * Math.sin(t) * stretch;
    const rx = dx * Math.cos(bearing) - dy * Math.sin(bearing);
    const ry = dx * Math.sin(bearing) + dy * Math.cos(bearing);
    ring.push([lon + rx / (111 * Math.cos((lat * Math.PI) / 180)), lat + ry / 111]);
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)])] };
}

/* ----------------------------- ZONES ----------------------------- */

export function generateZones(seed = 20260926): Zone[] {
  const rnd = mulberry32(seed);

  const draft = BELT_POLYGONS.map((p) => {
    const tag = p.iron_tag as IronTag;
    const [lo, span] = TAG_BAND[tag];
    // Long tail within each band: most polygons are mid-band, a few stand out.
    const raw = lo + Math.pow(rnd(), 1.6) * span;
    const score_mean = +clamp(raw, 0.55, 0.95).toFixed(3);
    const score_max = +clamp(score_mean + 0.02 + rnd() * 0.05, 0, 0.99).toFixed(3);

    // Drivers: sample bands by prior, sign them, scale by how strong the zone is.
    const picked = [...FEATURES]
      .map((f) => ({ f, w: FEATURE_PRIOR[f] * (0.45 + rnd()) }))
      .sort((a, b) => b.w - a.w)
      .slice(0, 6)
      .map(({ f }) => f);
    const strength = (score_mean - 0.55) / 0.40;
    const top_features: ZoneDriver[] = picked.map((name, i) => {
      const magnitude = (0.34 - i * 0.045) * (0.55 + strength) * (0.7 + rnd() * 0.7);
      // Vegetation and clay (lateritic soil, the main confuser) usually push against ore.
      const negative = ['ndvi_dry', 'clay', 'elevation'].includes(name)
        ? rnd() < 0.75 : rnd() < 0.22;
      return { name, contribution: +((negative ? -1 : 1) * magnitude).toFixed(3) };
    }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    // Working pits sit in forest leases (Saranda, Bailadila), so forest is common here.
    const luRoll = rnd();
    const land_use_flag: LandUseFlag =
      luRoll < 0.62 ? 'clear' :
      luRoll < 0.86 ? 'forest' :
      luRoll < 0.93 ? 'protected' :
      luRoll < 0.98 ? 'settlement' : 'water';

    return {
      p, score_mean, score_max, top_features, land_use_flag,
      dist_to_road_km: km(clamp(Math.abs(gauss(rnd, 2.6, 2.2)), 0.1, 14)),
    };
  });

  draft.sort((a, b) => b.score_mean - a.score_mean);

  return draft.map((d, i) => {
    const ring = d.p.geometry[0] as number[][];
    return {
      zone_id: d.p.poly_id,
      region_id: REGION_ID,
      belt: d.p.belt,
      iron_tag: d.p.iron_tag as IronTag,
      nearest_mine: d.p.nearest_mine,
      rank: i + 1,
      score_mean: d.score_mean,
      score_max: d.score_max,
      area_ha: d.p.area_ha,
      top_features: d.top_features,
      dist_to_mine_km: km(d.p.nearest_km),
      dist_to_road_km: d.dist_to_road_km,
      land_use_flag: d.land_use_flag,
      centroid: centroidOf(ring),
      geometry: { type: 'Polygon', coordinates: [ring as [number, number][]] },
      mock: true as const,
    };
  });
}

/* -------------------------- OCCURRENCES -------------------------- */

/** Real: GEM belt mines with no mapped polygon within 2 km — footprints still to digitise. */
export function generateOccurrences(): Occurrence[] {
  return IRON_MINES
    .filter((m) => m.nearest_polygon_km > 2)
    .map((m) => ({
      occurrence_id: m.mine_id,
      region_id: REGION_ID,
      name: m.name,
      lat: m.lat,
      lon: m.lon,
      source: `GEM iron mine (${m.status}); nearest mapped polygon ${m.nearest_polygon_km.toFixed(1)} km`,
    }));
}

/* -------------------------- CONSTRAINTS -------------------------- */

export function generateConstraints(seed = 991): GeoJSON.FeatureCollection {
  const rnd = mulberry32(seed);
  // Indicative shapes at real places; the outlines themselves are synthetic.
  const specs = [
    { name: 'Saranda reserved forest (indicative)', kind: 'forest', lon: 85.32, lat: 22.02, r: 11 },
    { name: 'Settlement cluster, Joda–Barbil (indicative)', kind: 'settlement', lon: 85.42, lat: 22.02, r: 3 },
    { name: 'Bailadila reserved forest (indicative)', kind: 'forest', lon: 81.18, lat: 18.75, r: 7 },
    { name: 'Settlement cluster, Sandur (indicative)', kind: 'settlement', lon: 76.55, lat: 15.09, r: 2.5 },
    { name: 'Tungabhadra reservoir (indicative)', kind: 'water', lon: 76.34, lat: 15.27, r: 6 },
  ];
  return {
    type: 'FeatureCollection',
    features: specs.map((s, i) => ({
      type: 'Feature',
      id: i,
      properties: { name: s.name, kind: s.kind, source: 'synthetic' },
      geometry: blob(mulberry32(9000 + i + Math.floor(rnd() * 10)), s.lon, s.lat, s.r),
    })),
  };
}

/* --------------------------- PROVENANCE -------------------------- */

export const PROVENANCE: Provenance = {
  model_version: 'iron-ore-surface v0.1-synthetic',
  trained_at: '2026-11-02',
  // Real Stage 1 counts: polygons tagged iron (GEM point within 1 km) in the two training belts,
  // and in the held-out Bellary–Hospet–Sandur belt.
  label_count: BELT_POLYGONS.filter((p) => p.belt !== 'bellary_hospet_sandur' && ['0km', '1km'].includes(p.iron_tag)).length,
  heldout_count: BELT_POLYGONS.filter((p) => p.belt === 'bellary_hospet_sandur').length,
  cv_auc_mean: 0.81,
  cv_auc_folds: [0.84, 0.78, 0.83, 0.76, 0.84],
  feature_count: FEATURES.length,
  source: 'synthetic',
  excluded_features: ['dist_to_mine_km', 'dist_to_lease_boundary_km'],
};

/* --------------------------- PRODUCTION -------------------------- */

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monsoon weight for a day-of-year: June→September, peaking in late July. */
function monsoonWeight(doy: number) {
  const peak = 205;
  const w = Math.exp(-Math.pow((doy - peak) / 42, 2));
  return doy >= 152 && doy <= 288 ? w : w * 0.12;
}

/** Festival / harvest absenteeism windows (Holi, monsoon sowing, Diwali). */
function festivalDip(doy: number) {
  const windows: Array<[number, number, number]> = [
    [72, 78, 0.16], [178, 190, 0.09], [300, 315, 0.20], [1, 4, 0.10],
  ];
  for (const [a, b, mag] of windows) if (doy >= a && doy <= b) return mag;
  return 0;
}

export function generateProduction(
  mineId: string | 'ALL' = 'ALL',
  years = 3,
  seed = 4242,
): ProductionRecord[] {
  const mines = mineId === 'ALL' ? PLAN_MINES : PLAN_MINES.filter((m) => m.mine_id === mineId);
  const out: ProductionRecord[] = [];
  const end = new Date('2026-08-31T00:00:00Z').getTime();
  const start = end - Math.round(years * 365.25) * DAY;

  for (const mine of mines) {
    const rnd = mulberry32(seed + hashSeed(mine.mine_id));
    const oc = mine.mine_type === 'OC';
    // Plans are set below nameplate, so a well-run dry-season month lands near 100%
    // achievement rather than chronically under-delivering.
    const planFactor = 0.835 + rnd() * 0.03;

    // Weibull time-to-failure per equipment class; opencast loaders work harder.
    const nextFail = {
      crusher: weibull(rnd, 1.7, 46),
      loader: weibull(rnd, 1.5, oc ? 28 : 38),
      hoist: oc ? Infinity : weibull(rnd, 2.1, 62),
    };
    let cum7: number[] = [];
    let cum30: number[] = [];
    let soil = 0.18;
    let depth = mine.depth_m ?? 0;

    for (let t = start; t <= end; t += DAY) {
      const d = new Date(t);
      const doy = Math.floor((t - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY);
      const mw = monsoonWeight(doy);
      const is_monsoon = doy >= 152 && doy <= 288;

      // Rainfall: gamma-ish, driven by the monsoon envelope.
      const wet = rnd() < 0.05 + mw * 0.72;
      const rainfall_mm = wet ? +(Math.abs(gauss(rnd, 6 + mw * 26, 6 + mw * 22))).toFixed(1) : 0;
      cum7.push(rainfall_mm); if (cum7.length > 7) cum7.shift();
      cum30.push(rainfall_mm); if (cum30.length > 30) cum30.shift();
      const rain_cum_7 = +cum7.reduce((a, b) => a + b, 0).toFixed(1);
      const rain_cum_30 = +cum30.reduce((a, b) => a + b, 0).toFixed(1);
      soil = clamp(soil * 0.94 + rainfall_mm * 0.006 + gauss(rnd, 0, 0.004), 0.05, 0.62);

      // Equipment: countdown to failure, then a repair block of downtime hours.
      let dt_crusher = 0, dt_loader = 0, dt_hoist: number | null = oc ? null : 0;
      nextFail.crusher -= 1; nextFail.loader -= 1; if (!oc) nextFail.hoist -= 1;
      if (nextFail.crusher <= 0) { dt_crusher = +clamp(Math.abs(gauss(rnd, 5.5, 3.2)), 0.5, 20).toFixed(1); nextFail.crusher = weibull(rnd, 1.7, 46); }
      if (nextFail.loader <= 0) { dt_loader = +clamp(Math.abs(gauss(rnd, 4.2, 2.6)), 0.5, 16).toFixed(1); nextFail.loader = weibull(rnd, 1.5, oc ? 28 : 38); }
      if (!oc && nextFail.hoist <= 0) { dt_hoist = +clamp(Math.abs(gauss(rnd, 7.0, 4.0)), 0.5, 24).toFixed(1); nextFail.hoist = weibull(rnd, 2.1, 62); }
      // Wet ground degrades opencast haulage even without a hard failure.
      if (oc) dt_loader = +(dt_loader + mw * rnd() * 3.1).toFixed(1);

      const totalDown = dt_crusher + dt_loader + (dt_hoist ?? 0);
      const equipment_available_pct = +clamp(100 - totalDown * (oc ? 2.4 : 1.7) - Math.abs(gauss(rnd, 1.6, 1.4)), 42, 100).toFixed(1);

      // Blasting: wet holes and high cumulative rain postpone rounds.
      const blasts_planned = oc ? (rnd() < 0.42 ? 2 : 1) : (rnd() < 0.30 ? 3 : 2);
      const delayP = clamp(0.05 + (oc ? mw * 0.62 : mw * 0.22) + (rain_cum_7 > 90 ? 0.16 : 0), 0, 0.9);
      const blast_delay_flag = rnd() < delayP;
      const blasts_executed = blast_delay_flag
        ? Math.max(0, blasts_planned - (rnd() < 0.6 ? 1 : blasts_planned))
        : blasts_planned;

      const workers_present_pct = +clamp(
        94 - festivalDip(doy) * 100 * (0.6 + rnd() * 0.8) - mw * 3 + gauss(rnd, 0, 2.2), 52, 100,
      ).toFixed(1);

      // Grade drifts with depth in the underground mines; capacity creeps down.
      if (!oc) depth += 0.012;
      const depthDrag = oc ? 0 : clamp((depth - (mine.depth_m ?? 0)) / 900, 0, 0.05);

      // Reduced-shift days (maintenance windows, holidays) scale plan and output alike.
      const dayScale = rnd() < 0.14 ? 0.5 : 1;
      const planned_tonnes = Math.round(
        mine.nominal_capacity_tpd * planFactor * dayScale * (0.97 + rnd() * 0.06),
      );

      // Monsoon suppression is far stronger for opencast than underground.
      const rainHit = oc
        ? clamp(mw * 0.55 + (rain_cum_30 > 260 ? 0.18 : 0) + rainfall_mm / 260, 0, 0.82)
        : clamp(mw * 0.11 + (rain_cum_30 > 320 ? 0.07 : 0), 0, 0.26);
      const yieldFactor = clamp(
        (equipment_available_pct / 100) *
        (workers_present_pct / 100) *
        (blasts_planned ? 0.55 + 0.45 * (blasts_executed / blasts_planned) : 1) *
        (1 - rainHit) * (1 - depthDrag) * (1 + gauss(rnd, 0, 0.055)),
        0.05, 1.22,
      );
      // Output is driven by the site's own capability, not by the plan it was
      // measured against — so plan achievement is an emergent quantity.
      const actual_tonnes = Math.max(0, Math.round(mine.nominal_capacity_tpd * dayScale * yieldFactor));

      out.push({
        date: iso(d), mine_id: mine.mine_id, planned_tonnes, actual_tonnes,
        equipment_available_pct,
        downtime_hrs_crusher: dt_crusher, downtime_hrs_loader: dt_loader, downtime_hrs_hoist: dt_hoist,
        blasts_planned, blasts_executed, blast_delay_flag,
        workers_present_pct, rainfall_mm, rain_cum_7, rain_cum_30,
        soil_moisture: +soil.toFixed(3), is_monsoon,
        shortfall_flag: actual_tonnes < planned_tonnes * 0.9,
      });
    }
  }
  return out;
}

/* ---------------------------- FORECAST --------------------------- */

export function generateForecast(
  mineId: string,
  horizonDays = 30,
  history?: ProductionRecord[],
  scenario?: { rainfallScale: number; equipmentPct: number },
): Forecast {
  const mine = PLAN_MINES.find((m) => m.mine_id === mineId) ?? PLAN_MINES[0];
  const rows = (history ?? generateProduction(mineId)).filter((r) => r.mine_id === mineId);
  const rnd = mulberry32(1337 + hashSeed(mineId));
  const tail = rows.slice(-90);
  const plannedBase = tail.length
    ? tail.reduce((a, r) => a + r.planned_tonnes, 0) / tail.length
    : mine.nominal_capacity_tpd * 0.7;
  // Baseline capability is measured on dry-season days only. The monsoon
  // penalty is then applied per forecast date below, so it is not counted twice.
  const dry = rows.filter((r) => !r.is_monsoon).slice(-240);
  const baseRatio = dry.length
    ? dry.reduce((a, r) => a + r.actual_tonnes / Math.max(1, r.planned_tonnes), 0) / dry.length
    : 0.95;

  const last = rows.length ? new Date(rows[rows.length - 1].date).getTime() : Date.now();
  const oc = mine.mine_type === 'OC';
  const rainScale = scenario?.rainfallScale ?? 1;
  const equipTarget = scenario?.equipmentPct ?? null;

  const points = Array.from({ length: horizonDays }, (_, i) => {
    const d = new Date(last + (i + 1) * DAY);
    const doy = Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY);
    const mw = monsoonWeight(doy);
    const planned = Math.round(plannedBase * (0.97 + rnd() * 0.06));

    const rainHit = clamp((oc ? mw * 0.55 : mw * 0.11) * rainScale, 0, 0.85);
    const equipAdj = equipTarget === null ? 1 : clamp(equipTarget / 88, 0.5, 1.15);
    const centre = clamp(baseRatio * (1 - rainHit) * equipAdj, 0.05, 1.15);

    // Bands widen with horizon — uncertainty is not flat.
    const spread = (0.055 + 0.0042 * i) * (oc ? 1.35 : 1);
    return {
      date: iso(d),
      p10: Math.round(planned * clamp(centre - spread * 1.28, 0, 1.3)),
      p50: Math.round(planned * centre),
      p90: Math.round(planned * clamp(centre + spread * 1.28, 0, 1.4)),
      planned,
    };
  });

  // P(cumulative output < cumulative plan) over the horizon, from the daily
  // quantile band. Daily misses are far from independent — weather and equipment
  // faults persist for days — so the independent variance is inflated by an
  // assumed lag-1 correlation before the normal approximation is applied.
  const RHO = 0.35;
  const plannedSum = points.reduce((a, p) => a + p.planned, 0);
  const p50Sum = points.reduce((a, p) => a + p.p50, 0);
  // p90 - p10 spans 2 x 1.2816 standard deviations under a normal.
  const varSum = points.reduce((a, p) => a + Math.pow((p.p90 - p.p10) / 2.5631, 2), 0);
  const n = points.length;
  const sdCum = Math.sqrt(Math.max(1, varSum * (1 + RHO * (n - 1))));
  const z = (plannedSum - p50Sum) / sdCum;
  // Abramowitz & Stegun logistic approximation to the normal CDF.
  const normalCdf = (x: number) => 1 / (1 + Math.exp(-1.702 * x));
  const shortfall_probability = +clamp(normalCdf(z), 0.02, 0.97).toFixed(2);

  const drivers = [
    { name: 'rain_cum_30', contribution: +(-0.34 * (oc ? 1.25 : 0.5) * rainScale).toFixed(3) },
    { name: 'downtime_hrs_crusher', contribution: -0.19 },
    { name: 'blast_delay_flag', contribution: +(-0.16 * (oc ? 1.3 : 0.7)).toFixed(3) },
    { name: 'equipment_available_pct', contribution: +(0.21 * (equipTarget ? equipTarget / 88 : 1)).toFixed(3) },
    { name: 'workers_present_pct', contribution: 0.11 },
    { name: 'soil_moisture', contribution: -0.08 },
  ].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    mine_id: mineId,
    generated_at: new Date('2026-09-01T06:00:00Z').toISOString(),
    horizon_days: horizonDays,
    points,
    shortfall_probability,
    drivers,
  };
}

/* ------------------------- RECOMMENDATIONS ----------------------- */

export function generateRecommendations(mineId: string): Recommendation[] {
  const mine: Mine = PLAN_MINES.find((m) => m.mine_id === mineId) ?? PLAN_MINES[0];
  const oc = mine.mine_type === 'OC';
  const cap = mine.nominal_capacity_tpd;
  const base: Recommendation[] = oc
    ? [
        { rank: 1, action: 'Advance blasting rounds into the pre-monsoon window', driver: 'rain_cum_30', expected_recovery_tonnes: Math.round(cap * 7.4), confidence: 'high', rationale: 'Executed-blast ratio at this pit falls sharply once 30-day cumulative rainfall passes ~180 mm; pulling rounds forward moves tonnes out of the affected window.' },
        { rank: 2, action: 'Commission additional pit dewatering capacity on the lower benches', driver: 'soil_moisture', expected_recovery_tonnes: Math.round(cap * 4.1), confidence: 'medium', rationale: 'Loader downtime tracks soil moisture at this pit; bench access is the binding constraint, not fleet count.' },
        { rank: 3, action: 'Shift crusher preventive maintenance to the monsoon trough', driver: 'downtime_hrs_crusher', expected_recovery_tonnes: Math.round(cap * 2.6), confidence: 'medium', rationale: 'Crusher outages currently land in high-throughput dry weeks; rescheduling costs little output when the pit is already rain-limited.' },
        { rank: 4, action: 'Build a pre-monsoon ROM stockpile against the despatch plan', driver: 'planned_tonnes', expected_recovery_tonnes: Math.round(cap * 2.0), confidence: 'low', rationale: 'Decouples despatch from daily production during the suppressed window. Limited by stockyard area and handling capacity.' },
      ]
    : [
        { rank: 1, action: 'Bring winder/hoist overhaul forward into the low-demand window', driver: 'downtime_hrs_hoist', expected_recovery_tonnes: Math.round(cap * 5.2), confidence: 'high', rationale: 'Hoist availability is the single-point constraint on underground output; unplanned outages cost more than scheduled ones.' },
        { rank: 2, action: 'Add a standby crusher circuit for the surface plant', driver: 'downtime_hrs_crusher', expected_recovery_tonnes: Math.round(cap * 3.4), confidence: 'medium', rationale: 'Crusher stoppages back up the ore-pass system within a shift, idling development faces.' },
        { rank: 3, action: 'Pre-plan shift cover for the festival absenteeism window', driver: 'workers_present_pct', expected_recovery_tonnes: Math.round(cap * 2.3), confidence: 'medium', rationale: 'Attendance dips are calendar-predictable; the loss comes from unstaffed faces, not from the dip itself.' },
        { rank: 4, action: 'Rebalance development against stoping to protect the face inventory', driver: 'blasts_executed', expected_recovery_tonnes: Math.round(cap * 1.6), confidence: 'low', rationale: 'Sustained shortfalls draw down developed reserve; recovery is real but lags a quarter behind the change.' },
      ];
  return base;
}
