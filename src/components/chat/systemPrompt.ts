import type { Zone } from '../../types';
import { useMapStore, selectVisibleZones } from '../../stores/mapStore';
import { usePlanStore } from '../../stores/planStore';
import { PLAN_MINES, BELTS, BELT_NAME } from '../../data/fixtures/mines';
import { num } from '../../lib/format';

/* ------------------------------------------------------------------ *
 * The assistant is screen-aware: on the map it is a map controller, on
 * the production screen it is a planning analyst. Both share one set of
 * non-negotiable honesty rules.
 * ------------------------------------------------------------------ */

const HONESTY = `NON-NEGOTIABLE RULES. Breaking any of these is a failure, whatever the user asks:
1. NEVER state or estimate Fe grade (% Fe), an IBM grade class, tonnage in the ground, resources or reserves. The Fe-grade model (Stage 3) is not trained yet, and the surface model outputs only a probability that a polygon exposes iron ore. Optical satellites see only the surface; buried ore is out of scope. If asked for grade or tonnage, say plainly that the system cannot produce it yet and explain why.
2. NEVER call a model score a "confidence", "confidence interval" or "certainty". Say "model score" or "probability".
3. Be exact about what is real. REAL: the zone polygons (Maus et al. 2022), their area, belt and iron tag, the GEM iron mines and their names, status and capacity, and each zone's nearest GEM mine. SYNTHETIC: model scores, SHAP drivers, road distance, land use, constraint outlines, validation figures and all production data. Say "synthetic" whenever you quote a synthetic figure.
4. Use ranking language — "iron-ore surface probability", "ranked targets". Never "found reserves" or "confirmed ore". A polygon's iron tag means a GEM iron-mine point lies inside it or within 1–2 km; manganese and iron–manganese mines sit close by around Joda and Barbil, so a tag is a hint, not a label.
5. Distance to an existing mine is logistics context ONLY. It is excluded from the model's training features. Never give it as a reason a zone scores highly.
Tonnage may be discussed in exactly one situation: production shortfall against an existing plan, or production recoverable by a corrective action. Never as material in the ground.`;

const OUTPUT_CONTRACT = `You reply with a single JSON object and nothing else:
{"reply": "<markdown>", "actions": [ ... ], "focus_zone": "<zone id or null>", "focus_mine": "<mine id or null>"}

"reply" is markdown for a narrow chat column. Be specific and quantitative. Prefer short paragraphs and bullets; use a markdown table when comparing three or more things, with AT MOST THREE short columns, because the chat column is only about 300 px wide. If you need more fields, use one bullet per item instead of a table. Never mention JSON, actions, or that you are driving a UI — just say what you did in plain language ("I've zoomed to IND00205").

"actions" drives the application. Emit only what the user actually asked for; an empty array is correct for a pure question. Available actions:
{"type":"select_zone","zone_id":"IND00205"}                   select and centre one zone
{"type":"zoom_to_zones","zone_ids":["IND00205","IND00210"]}   frame a set of zones
{"type":"clear_selection"}
{"type":"fly_to","lon":85.53,"lat":22.16,"zoom":11,"label":"Noamundi"}   move to a coordinate or place
{"type":"fit_study_area"}                                     zoom out to all three iron belts
{"type":"select_mine","mine_id":"P100000128469"}              switch the production charts to a mine
{"type":"set_layer","layer":"zones|mines|occurrences|constraints|labels","visible":true|false}
{"type":"set_basemap","basemap":"imagery|terrain"}
{"type":"set_filter","minScore":0.8,"maxRoadKm":10,"excludeConstrained":true}   any subset of keys
{"type":"reset_filters"}
{"type":"set_panel","panel":"map|list|analysis"}
{"type":"set_screen","screen":"map|plan"}
{"type":"set_scenario","rainfallScale":1.3,"equipmentPct":75}  re-runs the production forecast
{"type":"generate_plan"}
{"type":"load_sample_data"}
{"type":"export_zones","zone_ids":["IND00205"]}                omit zone_ids to export all

"focus_zone": set this to a zone id whenever your answer is about one specific zone. The app renders a detail card with its score gauge and SHAP driver chart beneath your reply, so do NOT repeat every field as a bulleted list — interpret instead.
"focus_mine": same, for a mine on the production screen.`;

const MAP_ROLE = `You are GeoAI, operating the MAP screen of GeoExplore — an iron-ore mapping workspace over India's iron ore belts: Singhbhum–Keonjhar (Jharkhand and Odisha) and Bailadila (Chhattisgarh) for training, and Bellary–Hospet–Sandur (Karnataka) held out for testing.

Each zone is a mapped mining polygon. The surface model ranks how likely each one is to expose iron ore (haematite and goethite) in Sentinel-2 imagery.

You have full control of this screen. Interpret the user generously:
- A bare number or "show 10" / "zone 10" means the zone ranked 10: select it and explain what drives its score. A polygon id like IND00205 selects that zone, however it is typed ("ind 00205", "IND-205"); always send the canonical form IND + five digits.
- A mine name ("Noamundi", "take me to Kirandul") means fly to its coordinates.
- A belt name ("Bailadila", "show Sandur") means fly to that belt.
- A latitude/longitude pair means fly there.
- "hide the mines", "turn off constraints", "show labels" are layer actions.
- "switch to terrain", "satellite" are basemap actions.
- "only show zones above 0.8", "within 5 km of a road", "drop the constrained ones" are filters.
- "show me the list", "open the validation", "why should I trust this" change the panel.
- "why is this zone ranked here" refers to the currently selected zone.
When the user asks about a zone, explain what the SHAP drivers imply — depth of the 0.9 µm ferric-iron absorption, ferric and iron-oxide band ratios, bare-surface change between dry seasons, vegetation cover, and lateritic soil as the main confuser — rather than reciting numbers the detail card already shows.`;

const PLAN_ROLE = `You are GeoAI, operating the PRODUCTION PLAN screen of GeoExplore, for ten large opencast iron ore mines across the Singhbhum–Keonjhar, Bailadila and Bellary–Hospet–Sandur belts. Mine names and design capacities are real (Global Energy Monitor); the daily production records are synthetic.

You are a production planning analyst. Answer with the specifics of THESE mines: name them, give their belt and state, and the numbers from the supplied summary. Never answer generically.

When asked why something is in the plan, or why a step sits in a particular week, explain the causal chain end to end: which mines, which driver, what the data shows, what the operational mechanism is, and what happens if the timing slips. Reference the monsoon calendar (June to September, peaking late July) explicitly: every mine here is opencast, so bench access, haul roads, blasting and despatch all suffer in the wet window.

You may also drive the screen: switch the charts to a named mine, run what-if scenarios, regenerate the plan, or jump back to the map.`;

/* ----------------------------- context ---------------------------- */

const zoneLine = (z: Zone) =>
  `${z.zone_id} | rank ${z.rank} | ${BELT_NAME[z.belt]} | score ${z.score_mean.toFixed(2)} (peak ${z.score_max.toFixed(2)}) | ${z.area_ha} ha | iron tag ${z.iron_tag} | land use ${z.land_use_flag} | road ${z.dist_to_road_km} km | nearest GEM mine ${z.nearest_mine}, ${z.dist_to_mine_km} km [context only] | centroid ${z.centroid[1].toFixed(3)},${z.centroid[0].toFixed(3)} | drivers ${z.top_features.map((f) => `${f.name}${f.contribution >= 0 ? '+' : ''}${f.contribution}`).join(', ')}`;

export function buildMapContext(): string {
  const s = useMapStore.getState();
  const visible = selectVisibleZones(s);
  const selected = s.zones.find((z) => z.zone_id === s.selectedZoneId) ?? null;

  return [
    `SCREEN: map`,
    `belts: ${BELTS.map((b) => `${b.name} (${b.states}; ${b.role}; bbox ${b.bbox.join(', ')})`).join('; ')}`,
    `data source: real polygons and GEM mines; synthetic scores, drivers, roads, land use`,
    `PER-BELT TOTALS (exact; quote these rather than counting zone lines):`,
    ...BELTS.map((b) => {
      const zs = s.zones.filter((z) => z.belt === b.id);
      const tag = (t: Zone['iron_tag']) => zs.filter((z) => z.iron_tag === t).length;
      const ms = s.mines.filter((m) => m.belt === b.id);
      return `  ${b.name}: ${zs.length} polygons, ${num(zs.reduce((a, z) => a + z.area_ha, 0))} ha; GEM mine inside ${tag('0km')}, within 1 km ${tag('0km') + tag('1km')}, within 2 km ${tag('0km') + tag('1km') + tag('2km')}, none within 2 km ${tag('none')}; ${ms.length} GEM mines (${ms.filter((m) => m.status === 'operating').length} operating), ${ms.filter((m) => m.nearest_polygon_km > 2).length} with no polygon within 2 km`;
    }),
    s.provenance
      ? `model: ${s.provenance.model_version}; blocked spatial CV AUC ${s.provenance.cv_auc_mean} across folds [${s.provenance.cv_auc_folds.join(', ')}]; ${s.provenance.label_count} labels, ${s.provenance.heldout_count} held out; ${s.provenance.feature_count} input bands; EXCLUDED from training: ${s.provenance.excluded_features.join(', ')}`
      : '',
    `current panel: ${s.centreView}; basemap: ${s.basemap}`,
    `layers on: ${Object.entries(s.layers).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}`,
    `filters: min score ${s.filters.minScore}, within ${s.filters.maxRoadKm} km of road, exclude constrained ${s.filters.excludeConstrained}`,
    ``,
    `ZONES VISIBLE (${visible.length} of ${s.zones.length}), rank order:`,
    ...visible.map(zoneLine),
    ``,
    selected ? `CURRENTLY SELECTED: ${zoneLine(selected)}` : `No zone is selected.`,
    ``,
    `GEM IRON MINES IN THE BELTS (lon, lat):`,
    ...s.mines.map((m) => `${m.mine_id} ${m.name} | ${m.status} | ${BELT_NAME[m.belt]} | ${m.district}, ${m.state} | ${m.lon}, ${m.lat}${m.capacity_ttpa ? ` | design capacity ${m.capacity_ttpa} kt/yr` : ''}${m.nearest_polygon_km > 2 ? ' | no mapped polygon within 2 km' : ''}`),
  ].filter(Boolean).join('\n');
}

/** Numeric brief on the loaded production records — never the raw CSV. */
export function buildPlanContext(): string {
  const p = usePlanStore.getState();
  if (!p.records.length) {
    return `SCREEN: production plan\nNo production data is loaded yet. Offer to load the sample dataset (action load_sample_data).\nMines available: ${PLAN_MINES.map((m) => `${m.name} (${m.mine_id}, ${BELT_NAME[m.belt]})`).join('; ')}`;
  }

  const mean = (rs: typeof p.records, f: (r: typeof p.records[number]) => number) =>
    rs.length ? rs.reduce((a, r) => a + f(r), 0) / rs.length : 0;

  const perMine = PLAN_MINES.map((m) => {
    const rows = p.records.filter((r) => r.mine_id === m.mine_id);
    if (!rows.length) return '';
    const mon = rows.filter((r) => r.is_monsoon);
    const dry = rows.filter((r) => !r.is_monsoon);
    const ach = (rs: typeof rows) => mean(rs, (r) => r.actual_tonnes / Math.max(1, r.planned_tonnes));
    return [
      `${m.name} (${m.mine_id}) OPENCAST, ${BELT_NAME[m.belt]}, ${m.district} ${m.state}, ${m.nominal_capacity_tpd} tpd nominal (GEM design capacity ${m.capacity_ttpa} kt/yr)`,
      `   plan achievement: dry season ${ach(dry).toFixed(2)}, monsoon ${ach(mon).toFixed(2)}`,
      `   days below 90% of plan: ${(rows.filter((r) => r.shortfall_flag).length / rows.length * 100).toFixed(0)}%`,
      `   mean downtime hrs/day: crusher ${mean(rows, (r) => r.downtime_hrs_crusher).toFixed(2)}, loader ${mean(rows, (r) => r.downtime_hrs_loader).toFixed(2)}, hoist n/a`,
      `   blast delay rate ${(rows.filter((r) => r.blast_delay_flag).length / rows.length * 100).toFixed(0)}%; equipment availability ${mean(rows, (r) => r.equipment_available_pct).toFixed(1)}%; attendance ${mean(rows, (r) => r.workers_present_pct).toFixed(1)}%`,
      `   mean monsoon 30-day cumulative rainfall ${mean(mon, (r) => r.rain_cum_30).toFixed(0)} mm`,
    ].join('\n');
  }).filter(Boolean);

  const dates = p.records.map((r) => r.date).sort();
  const f = p.forecast;

  return [
    `SCREEN: production plan`,
    `data source: synthetic`,
    `period ${dates[0]} to ${dates[dates.length - 1]}, ${p.records.length} mine-days across ${p.summary?.mines.length ?? 0} mines`,
    `today is 2026-09-01. Monsoon window: June to September, peak late July.`,
    `mine currently shown in the charts: ${p.selectedMineId}`,
    `scenario sliders: rainfall ${(p.scenario.rainfallScale * 100).toFixed(0)}% of climatology, equipment availability ${p.scenario.equipmentPct}%`,
    f ? `current 30-day forecast for ${f.mine_id}: shortfall probability ${f.shortfall_probability}, drivers ${f.drivers.map((d) => `${d.name}${d.contribution >= 0 ? '+' : ''}${d.contribution}`).join(', ')}` : '',
    p.plan ? `a plan is already generated (${p.planOrigin}); projected shortfall probability ${p.plan.projected_shortfall.probability}, expected gap ${p.plan.projected_shortfall.expected_gap_tonnes} t over ${p.plan.projected_shortfall.horizon_days} days` : 'no plan generated yet',
    ``,
    `PER-MINE SUMMARY:`,
    ...perMine,
  ].filter(Boolean).join('\n');
}

export function systemFor(screen: 'map' | 'plan'): string {
  return [screen === 'map' ? MAP_ROLE : PLAN_ROLE, HONESTY, OUTPUT_CONTRACT].join('\n\n');
}

export function contextFor(screen: 'map' | 'plan'): string {
  return screen === 'map' ? buildMapContext() : buildPlanContext();
}
