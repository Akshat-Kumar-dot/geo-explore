import { useMapStore, selectVisibleZones } from '../../stores/mapStore';
import { usePlanStore } from '../../stores/planStore';
import { humanFeature, LAND_USE_LABEL, num } from '../../lib/format';
import type { ChatAction } from '../../lib/chatActions';
import type { Mine, Zone } from '../../types';
import { BELTS, BELT_NAME, PLAN_MINES } from '../../data/fixtures/mines';

export interface LocalReply {
  reply: string;
  actions: ChatAction[];
  focusZone: string | null;
  focusMine: string | null;
}

/**
 * Offline interpreter. Runs when the language model is unavailable, and also
 * supplies the deterministic command handling the model should not be trusted
 * with (exact zone ids, exact mine coordinates). The demo must never dead-end.
 */
export function localAnswer(question: string, screen: 'map' | 'plan'): LocalReply {
  const q = question.trim().toLowerCase();
  return screen === 'plan' ? planAnswer(q) : mapAnswer(question, q);
}

/* ------------------------------- map ------------------------------ */

function zoneByRank(rank: number): Zone | undefined {
  return useMapStore.getState().zones.find((z) => z.rank === rank);
}

/** Company and generic words that say nothing about which mine is meant. */
const NAME_NOISE = new Set(['mine', 'mines', 'steel', 'tata', 'sail', 'nmdc', 'jsw', 'omc', 'deposit',
  'minerals', 'mining', 'industries', 'limited', 'enterprises', 'company', 'iron', 'ore']);

/** Best mine for a free-text query: most distinctive name words matched, then largest capacity. */
function findMine(q: string, mines: Mine[]): Mine | undefined {
  let best: { m: Mine; hits: number } | undefined;
  for (const m of mines) {
    const words = m.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !NAME_NOISE.has(w));
    const hits = words.filter((w) => new RegExp(`\\b${w}\\b`).test(q)).length;
    if (!hits) continue;
    if (!best || hits > best.hits || (hits === best.hits && (m.capacity_ttpa ?? 0) > (best.m.capacity_ttpa ?? 0)))
      best = { m, hits };
  }
  return best?.m;
}

const TAG_TEXT: Record<Zone['iron_tag'], string> = {
  '0km': 'a GEM iron-mine point lies **inside** this polygon',
  '1km': 'a GEM iron-mine point lies **within 1 km**',
  '2km': 'a GEM iron-mine point lies **within 2 km**',
  none: '**no** GEM iron-mine point lies within 2 km',
};

export function zoneNarrative(z: Zone): string {
  const s = useMapStore.getState();
  const pos = z.top_features.filter((f) => f.contribution > 0).slice(0, 3);
  const neg = z.top_features.filter((f) => f.contribution < 0).slice(0, 2);
  return `**${z.zone_id}** is a mapped mining polygon of ${num(z.area_ha)} ha in the **${BELT_NAME[z.belt]}** belt, ranked **${z.rank} of ${s.zones.length}** with an iron-ore surface score of **${z.score_mean.toFixed(2)}** (synthetic).

Stage 1 evidence (real): ${TAG_TEXT[z.iron_tag]}. The nearest GEM mine is **${z.nearest_mine}**, ${z.dist_to_mine_km.toFixed(1)} km away. That distance is context only and is excluded from the model.

What lifts the score: ${pos.map((f) => `**${humanFeature(f.name).toLowerCase()}**`).join(', ')}. Together that reads as exposed haematite or goethite: a deep ferric-iron absorption near 0.9 µm on bare, recently worked ground.${neg.length ? ` Working against it: ${neg.map((f) => humanFeature(f.name).toLowerCase()).join(' and ')}. That usually means vegetation cover, or iron-rich lateritic soil, which looks like ore but isn't.` : ''}

Ground conditions (synthetic): **${LAND_USE_LABEL[z.land_use_flag].toLowerCase()}**${z.land_use_flag !== 'clear' ? ', so a clearance would be needed before any ground work' : ''}, ${z.dist_to_road_km.toFixed(1)} km from the nearest road.

This is a surface ranking, not an Fe grade or tonnage estimate.`;
}

function mapAnswer(original: string, q: string): LocalReply {
  const s = useMapStore.getState();
  const visible = selectVisibleZones(s);
  const none = { actions: [] as ChatAction[], focusZone: null, focusMine: null };

  /* --- explicit polygon id: "IND00205", "ind 00205", "IND-205" --- */
  const polyRef = original.match(/\bind[\s_-]*0*(\d{1,5})\b/i);
  if (polyRef) {
    const id = `IND${polyRef[1].padStart(5, '0')}`;
    const z = s.zones.find((x) => x.zone_id === id);
    if (z) return { reply: zoneNarrative(z), actions: [{ type: 'select_zone', zone_id: z.zone_id }], focusZone: z.zone_id, focusMine: null };
    return { ...none, reply: `${id} is not one of the ${s.zones.length} polygons in the study belts.` };
  }

  /* --- rank reference: "zone 10", "show 10", "10" --- */
  const zoneRef =
    q.match(/\bzone\s*0*(\d{1,3})\b/) ??
    q.match(/^(?:show|open|select|go to|zoom to|display)\s*(?:me\s*)?0*(\d{1,3})\b/) ??
    q.match(/^0*(\d{1,3})$/);
  if (zoneRef) {
    const z = zoneByRank(Number(zoneRef[1]));
    if (z) {
      return {
        reply: zoneNarrative(z),
        actions: [{ type: 'select_zone', zone_id: z.zone_id }],
        focusZone: z.zone_id,
        focusMine: null,
      };
    }
    return { ...none, reply: `There is no zone ranked ${zoneRef[1]}. The ranked set runs 1 to ${s.zones.length}.` };
  }

  /* --- coordinates --- */
  const coord = q.match(/(-?\d{1,2}\.\d+)\s*[,/ ]\s*(-?\d{2,3}\.\d+)/);
  if (coord) {
    const a = Number(coord[1]), b = Number(coord[2]);
    const [lat, lon] = Math.abs(a) <= 90 && Math.abs(b) > 90 ? [a, b] : Math.abs(a) < Math.abs(b) ? [a, b] : [b, a];
    return {
      reply: `Moved the map to ${lat.toFixed(4)}, ${lon.toFixed(4)}.`,
      actions: [{ type: 'fly_to', lon, lat, zoom: 11.5, label: `${lat.toFixed(3)}, ${lon.toFixed(3)}` }],
      focusZone: null, focusMine: null,
    };
  }

  /* --- belt by name --- */
  const belt = BELTS.find((b) =>
    b.name.toLowerCase().split(/[–-]/).some((part) => q.includes(part.trim())) || q.includes(b.id.replace(/_/g, ' ')));
  if (belt && /go|show|take|fly|zoom|where|open|belt/.test(q)) {
    const [w, sth, e, n] = belt.bbox;
    const inBelt = s.zones.filter((z) => z.belt === belt.id);
    return {
      reply: `**${belt.name}** (${belt.states}), the ${belt.role === 'train' ? 'training' : 'held-out test'} belt: ${inBelt.length} mapped polygons and ${s.mines.filter((m) => m.belt === belt.id).length} GEM iron mines.\n\nI've moved the map there.`,
      actions: [{ type: 'fly_to', lon: (w + e) / 2, lat: (sth + n) / 2, zoom: belt.id === 'bailadila' ? 10.5 : 9.3, label: belt.name }],
      focusZone: null, focusMine: null,
    };
  }

  /* --- mine by name --- */
  const mine = findMine(q, s.mines);
  if (mine && /go|show|take|fly|zoom|where|open|find|tell|about/.test(q)) {
    return {
      reply: `**${mine.name}**: ${mine.status} iron ore mine at ${mine.district}, ${mine.state} (${BELT_NAME[mine.belt]} belt).${mine.capacity_ttpa ? ` GEM design capacity ${num(mine.capacity_ttpa)} kt a year.` : ''}${mine.nearest_polygon_km > 2 ? ` No mapped polygon lies within 2 km of it, so its footprint still has to be digitised.` : ''}\n\nI've centred the map on it.`,
      actions: [{ type: 'fly_to', lon: mine.lon, lat: mine.lat, zoom: 11.5, label: mine.name }],
      focusZone: null, focusMine: mine.mine_id,
    };
  }

  /* --- layers --- */
  const layerWords: Array<[RegExp, 'zones' | 'mines' | 'occurrences' | 'constraints' | 'labels']> = [
    [/\bzone|target|favourab/, 'zones'],
    [/\bmine/, 'mines'],
    [/\boccurrence|footprint|unmapped|uncovered/, 'occurrences'],
    [/\bconstraint|forest|protected/, 'constraints'],
    [/\blabel/, 'labels'],
  ];
  if (/\b(hide|remove|turn off|switch off|show|add|turn on|enable|disable)\b/.test(q)) {
    const visibleWanted = !/\b(hide|remove|turn off|switch off|disable)\b/.test(q);
    const hit = layerWords.find(([re]) => re.test(q));
    if (hit) {
      return {
        reply: `${visibleWanted ? 'Showing' : 'Hiding'} the **${hit[1]}** layer.`,
        actions: [{ type: 'set_layer', layer: hit[1], visible: visibleWanted }],
        focusZone: null, focusMine: null,
      };
    }
  }

  /* --- basemap --- */
  if (/basemap|satellite|imagery|terrain|relief/.test(q)) {
    const basemap = /terrain|relief/.test(q) ? 'terrain' : 'imagery';
    return {
      reply: `Basemap switched to **${basemap === 'terrain' ? 'terrain base' : 'satellite imagery'}**.`,
      actions: [{ type: 'set_basemap', basemap }],
      focusZone: null, focusMine: null,
    };
  }

  /* --- constrained ground: a question, not a command --- */
  if (/constrain|forest|protect|land use|clearance/.test(q)) {
    const flagged = visible.filter((z) => z.land_use_flag !== 'clear');
    return {
      reply: `**${flagged.length} of ${visible.length}** visible zones fall on constrained ground:

${['forest', 'protected', 'settlement', 'water'].map((k) => {
  const n = flagged.filter((z) => z.land_use_flag === k).length;
  return n ? `- ${LAND_USE_LABEL[k]}: **${n}**` : '';
}).filter(Boolean).join('\n')}

Ask me to *exclude constrained zones* and I'll re-rank on ground that could be worked without a clearance.`,
      actions: [{ type: 'zoom_to_zones', zone_ids: flagged.slice(0, 6).map((z) => z.zone_id) }],
      focusZone: null, focusMine: null,
    };
  }

  /* --- filters --- */
  const scoreFilter = q.match(/(?:above|over|greater than|at least|>=?)\s*(0?\.\d+)/);
  const roadFilter = q.match(/within\s*(\d{1,2})\s*km/);
  const filterVerb = /\b(only|filter|limit|restrict|exclude|drop|hide|show only|narrow)\b/.test(q);
  if (scoreFilter || roadFilter || (filterVerb && /constrained|clear ground/.test(q))) {
    const a: ChatAction = { type: 'set_filter' };
    if (scoreFilter) a.minScore = Number(scoreFilter[1]);
    if (roadFilter) a.maxRoadKm = Number(roadFilter[1]);
    if (/exclude|drop|without|only clear/.test(q)) a.excludeConstrained = true;
    if (/include|show all|with constrained/.test(q)) a.excludeConstrained = false;
    return { reply: `Filters applied. I've updated the map and the ranked list.`, actions: [a], focusZone: null, focusMine: null };
  }

  /* --- panels --- */
  if (/\blist\b|table|ranked/.test(q))
    return { reply: 'Opened the ranked target table.', actions: [{ type: 'set_panel', panel: 'list' }], focusZone: null, focusMine: null };
  if (/validat|trust|auc|cross.?valid|analysis|believe/.test(q))
    return {
      reply: `Opened the validation view.\n\nThe headline number is a **blocked spatial cross-validation AUC of ${s.provenance?.cv_auc_mean.toFixed(2) ?? '—'}** across ${s.provenance?.cv_auc_folds.length ?? 0} folds. Blocked matters: whole geographic blocks are withheld, never individual points, so the model cannot score well simply by memorising the neighbourhood of its training data. The leave-one-belt-out test is the hard one: train on Singhbhum–Keonjhar and Bailadila, then score Bellary–Hospet–Sandur, which the model never saw. These figures are synthetic placeholders until Stage 2 is trained.`,
      actions: [{ type: 'set_panel', panel: 'analysis' }], focusZone: null, focusMine: null,
    };
  if (/production|shortfall|downtime|plan\b/.test(q))
    return { reply: 'Switching to the production plan screen.', actions: [{ type: 'set_screen', screen: 'plan' }], focusZone: null, focusMine: null };
  if (/export|download|csv/.test(q))
    return { reply: 'Exported the ranked target list as CSV, with the synthetic-data header attached.', actions: [{ type: 'export_zones' }], focusZone: null, focusMine: null };
  if (/zoom out|whole|study area|everything|reset view/.test(q))
    return { reply: 'Zoomed out to all three iron belts.', actions: [{ type: 'fit_study_area' }], focusZone: null, focusMine: null };

  /* --- currently selected zone --- */
  const selected = s.zones.find((z) => z.zone_id === s.selectedZoneId);
  if (selected && /why|driver|explain|this zone|rank/.test(q)) {
    return { reply: zoneNarrative(selected), actions: [], focusZone: selected.zone_id, focusMine: null };
  }

  /* --- top targets --- */
  if (/top|highest|best|rank|priorit|list/.test(q) || !q) {
    const top5 = visible.slice(0, 5);
    return {
      reply: `The five highest-ranked exploration targets in view:

| Zone | Belt | Score | Area | Nearest GEM mine |
|---|---|---|---|---|
${top5.map((z) => `| ${z.zone_id} | ${BELT_NAME[z.belt]} | ${z.score_mean.toFixed(2)} | ${num(z.area_ha)} ha | ${z.nearest_mine} |`).join('\n')}

Together they cover ${num(top5.reduce((a, z) => a + z.area_ha, 0))} ha. ${top5.filter((z) => z.iron_tag === '0km').length} of the five have a GEM iron-mine point inside them.

These are iron-ore surface rankings (synthetic scores on real polygons), not reserves. No Fe grade or tonnage is implied.`,
      actions: [{ type: 'zoom_to_zones', zone_ids: top5.map((z) => z.zone_id) }],
      focusZone: null, focusMine: null,
    };
  }

  return {
    ...none,
    reply: `I can drive this map for you. Try:

- **"show 10"** or **"IND00205"**: select a polygon and explain what drives its score
- **"take me to Noamundi"** or **"show Bailadila"**: fly to a GEM iron mine or a belt
- **"hide the constraints"**, **"switch to terrain"**: layers and basemap
- **"only zones above 0.85 within 5 km of a road"**: filters
- **"why should I trust this"**: the validation story

Polygons and mines are real; scores are synthetic until Stage 2 is trained. Never an Fe grade or tonnage estimate.`,
  };
}

/* ------------------------------ plan ------------------------------ */

function planAnswer(q: string): LocalReply {
  const p = usePlanStore.getState();
  const mines = PLAN_MINES;

  if (!p.records.length) {
    return {
      reply: 'No production data is loaded yet. I can load the three-year synthetic sample for the ten iron ore mines. Say the word, or use **Load sample data** on the right.',
      actions: /load|sample|yes|go ahead|start/.test(q) ? [{ type: 'load_sample_data' }] : [],
      focusZone: null, focusMine: null,
    };
  }

  const named = mines.find((m) => q.includes(m.mine_id.toLowerCase())) ?? findMine(q, mines);
  if (named) {
    const rows = p.records.filter((r) => r.mine_id === named.mine_id);
    const mon = rows.filter((r) => r.is_monsoon);
    const dry = rows.filter((r) => !r.is_monsoon);
    const ach = (rs: typeof rows) => rs.reduce((a, r) => a + r.actual_tonnes / Math.max(1, r.planned_tonnes), 0) / Math.max(1, rs.length);
    const oc = named.mine_type === 'OC';
    return {
      reply: `**${named.name}**: ${oc ? 'opencast' : 'underground'} iron ore mine, ${named.district}, ${named.state} (${BELT_NAME[named.belt]}). Nominal ${num(named.nominal_capacity_tpd)} tpd from GEM's design capacity.

Plan achievement runs **${ach(dry).toFixed(2)} in the dry season** and **${ach(mon).toFixed(2)} through the monsoon**. ${oc
  ? `That collapse is the whole problem at this pit. Bench access and haul-road condition degrade once 30-day cumulative rainfall passes roughly 180 mm, blast rounds get postponed because holes flood, and loader availability falls with soil moisture. None of it is an equipment-fleet problem — it is a water-management problem.`
  : `Underground output is largely insulated from rainfall; the residual dip comes from surface handling, despatch and attendance rather than from the face. The binding constraint here is hoist availability, which is a single point of failure for the whole mine.`}

Days below 90% of plan: **${(rows.filter((r) => r.shortfall_flag).length / rows.length * 100).toFixed(0)}%**. Blast delay rate **${(rows.filter((r) => r.blast_delay_flag).length / rows.length * 100).toFixed(0)}%**.

I've switched the charts to this mine. Synthetic demonstration data.`,
      actions: [{ type: 'select_mine', mine_id: named.mine_id }],
      focusZone: null, focusMine: named.mine_id,
    };
  }

  if (/generate|make.*plan|new plan|rebuild/.test(q))
    return { reply: 'Generating the corrective plan from the loaded records.', actions: [{ type: 'generate_plan' }], focusZone: null, focusMine: null };

  const rain = q.match(/rain(?:fall)?\s*(?:at|to)?\s*(\d{1,3})\s*%/);
  const equip = q.match(/(?:equipment|availability)\s*(?:at|to)?\s*(\d{1,3})\s*%/);
  if (rain || equip) {
    const a: ChatAction = { type: 'set_scenario' };
    if (rain) a.rainfallScale = Number(rain[1]) / 100;
    if (equip) a.equipmentPct = Number(equip[1]);
    return { reply: 'Re-running the forecast under that scenario.', actions: [a], focusZone: null, focusMine: null };
  }

  if (/why|timeline|week|sequence|order|reason/.test(q)) {
    return {
      reply: `The sequence is driven by the monsoon calendar, not by convenience.

**Weeks 1–4 are diagnostic** because you cannot prioritise ten mines without separating weather-driven loss from equipment-driven loss. All ten are opencast, but the Bailadila and Singhbhum–Keonjhar pits sit in heavier monsoon rainfall than the Sandur mines, so the same driver costs them more.

**Weeks 5–8 are the only window that matters for the pits.** Any tonne you intend to recover by pulling blasting forward has to be blasted before the ground gets wet. Slip this and the option disappears for a year — that is why it sits ahead of the equipment work even though the equipment work is cheaper.

**Weeks 9–14 hold the equipment programme** deliberately inside the rain-suppressed period. Crusher and loader overhauls currently land in high-throughput dry weeks, which is the most expensive possible time to take a machine out. Moving them costs almost nothing when the pit is already rain-limited.

**Weeks 15–22** buffer the workforce and then re-forecast against what actually happened, so each corrective action can be scored on tonnage recovered.

Synthetic demonstration data.`,
      actions: [], focusZone: null, focusMine: null,
    };
  }

  const achievement = (id: string, monsoon: boolean) => {
    const rs = p.records.filter((r) => r.mine_id === id && r.is_monsoon === monsoon);
    return rs.reduce((a, r) => a + r.actual_tonnes / Math.max(1, r.planned_tonnes), 0) / Math.max(1, rs.length);
  };
  const worst = [...mines].sort((a, b) => achievement(a.mine_id, true) - achievement(b.mine_id, true)).slice(0, 2);
  return {
    reply: `I can go deeper on any of the ten mines. Ask me things like:

- **"why is ${worst[0]?.name ?? 'this mine'} the highest risk"**: per-mine causal breakdown
- **"why is the equipment programme in weeks 9–14"** — plan sequencing logic
- **"rainfall at 140%"** — run a what-if and re-forecast
- **"generate the plan"**

The headline right now: **${worst.map((m) => m.name).join(' and ')}** have the weakest monsoon plan achievement. Synthetic production data on real mines.`,
    actions: [], focusZone: null, focusMine: null,
  };
}
