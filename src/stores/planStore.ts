import { create } from 'zustand';
import type { ProductionRecord, Forecast, ProductionPlan, Mine } from '../types';
import { adapter, type ScenarioInput } from '../data/adapters';
import { PLAN_MINES, BELT_NAME } from '../data/fixtures/mines';
import { generate, extractJson } from '../lib/gemini';

export interface ValidationSummary {
  rows: number;
  from: string;
  to: string;
  mines: string[];
  missingCells: number;
  unknownColumns: string[];
  missingColumns: string[];
  ok: boolean;
}

export type PlanStatus = 'idle' | 'validating' | 'ready' | 'generating' | 'done';
/** How the rendered plan was produced — surfaced so nothing looks more authoritative than it is. */
export type PlanOrigin = 'llm' | 'fallback' | null;

interface PlanState {
  records: ProductionRecord[];
  mines: Mine[];
  summary: ValidationSummary | null;
  status: PlanStatus;
  fileName: string | null;
  error: string | null;

  plan: ProductionPlan | null;
  planOrigin: PlanOrigin;

  selectedMineId: string;
  forecast: Forecast | null;
  scenario: ScenarioInput;
  forecasting: boolean;

  loadSample: () => Promise<void>;
  ingest: (rows: ProductionRecord[], fileName: string, unknownColumns: string[], missingColumns: string[]) => void;
  generatePlan: () => Promise<void>;
  selectMine: (mineId: string) => Promise<void>;
  setScenario: (patch: Partial<ScenarioInput>) => Promise<void>;
  reset: () => void;
}

const DEFAULT_SCENARIO: ScenarioInput = { rainfallScale: 1, equipmentPct: 88 };

function summarise(
  rows: ProductionRecord[], unknownColumns: string[], missingColumns: string[],
): ValidationSummary {
  const dates = rows.map((r) => r.date).sort();
  const missingCells = rows.reduce((acc, r) => {
    let n = 0;
    for (const [k, v] of Object.entries(r)) {
      if (k === 'downtime_hrs_hoist') continue;      // legitimately null for opencast
      if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) n++;
    }
    return acc + n;
  }, 0);
  return {
    rows: rows.length,
    from: dates[0] ?? '—',
    to: dates[dates.length - 1] ?? '—',
    mines: [...new Set(rows.map((r) => r.mine_id))],
    missingCells,
    unknownColumns,
    missingColumns,
    ok: rows.length > 0 && missingColumns.length === 0,
  };
}

const PLAN_SYSTEM = `You are a senior mine production planner writing a corrective plan for ten large opencast iron ore mines: five in the Singhbhum–Keonjhar belt (Odisha and Jharkhand), three NMDC deposits at Bailadila (Chhattisgarh) and two NMDC mines at Sandur (Karnataka).

You return STRICT JSON ONLY. No prose, no markdown, no code fences, nothing before or after the object.

WHAT MAKES THIS PLAN GOOD — this is the whole task:
- Every activity NAMES THE SPECIFIC MINES it applies to, and says what is done at each. "Advance blasting" is worthless. "Advance three blast rounds per week at Bacheli Deposit 5 and Kirandul Deposit 11B from mid-May, working the lower benches first while haul roads are still trafficable" is the standard.
- Every step's timeline is JUSTIFIED BY THE DATA AND THE MONSOON CALENDAR. The monsoon runs June to September and peaks in late July. Work that must happen before the wet window goes early; work that is cheapest to do while production is already rain-suppressed goes into the wet window. Say which it is and why.
- All ten mines are opencast, but they do not share a climate: Bailadila and Singhbhum–Keonjhar get heavy monsoon rain, Sandur far less. Distinguish the belts throughout, and never prescribe the same measure everywhere without saying why.
- Name the actual constraint at each mine from the supplied numbers: crusher downtime, loader downtime, blast delay rate, attendance, or rainfall. Quote the figure you are reasoning from. Iron-ore specifics that matter: screening plants blind on wet fines, and despatch runs by rail from the mine sidings.
- Rationales explain the MECHANISM, not the correlation. Say why wet ground stops a bench, why a hoist outage idles development faces, why a festival dip costs unstaffed faces rather than hours.

HARD CONSTRAINTS — breaking any of these fails the task:
- NEVER state ore grade, percentage Fe, or resource/reserve tonnage. Tonnage figures may ONLY describe production shortfall against an existing plan, or production recoverable by a corrective action.
- NEVER call a probability a "confidence interval". The "confidence" field takes only "high", "medium" or "low", and refers to how well-evidenced the action is.
- Use only the mine names in the supplied summary. Invent nothing.
- Mine names and capacities are real; the production records are synthetic. Reason from them exactly as supplied.

Return exactly this shape:
{"plan_steps":[{"step":1,"title":"","activities":["",""],"timeline":"Week 1-2","status":"completed|in_progress|not_started"}],
"risk_drivers":[{"factor":"","influence_pct":0,"direction":"negative|positive"}],
"projected_shortfall":{"probability":0.0,"expected_gap_tonnes":0,"horizon_days":30},
"corrective_actions":[{"rank":1,"action":"","driver":"","expected_recovery_tonnes":0,"confidence":"high","rationale":""}]}

Requirements on the shape:
- 6 plan_steps, sequenced against the monsoon calendar. Each carries 4 to 6 activities. Each activity is one full sentence, names at least one mine by name, and is specific enough to hand to a mine manager. Set status from the supplied date (today is 2026-09-01) — early diagnostic steps may be "completed" or "in_progress".
- 5 risk_drivers whose influence_pct values sum to exactly 100.
- projected_shortfall covering the next 30 days across all ten mines, consistent with the per-mine shortfall figures supplied.
- 4 corrective_actions, ranked by expected recovered tonnage. "driver" is the raw column name it acts on (rain_cum_30, downtime_hrs_crusher, downtime_hrs_hoist, downtime_hrs_loader, blast_delay_flag, workers_present_pct, equipment_available_pct). Each "rationale" is 2 to 3 sentences: the mechanism, the mines affected, and what happens if the action slips.`;

/** Compact, numeric brief for the model — never the raw CSV. */
function briefFor(records: ProductionRecord[], mines: Mine[]): string {
  const byMine = mines.map((m) => {
    const rows = records.filter((r) => r.mine_id === m.mine_id);
    if (!rows.length) return null;
    const monsoon = rows.filter((r) => r.is_monsoon);
    const dry = rows.filter((r) => !r.is_monsoon);
    const ratio = (rs: ProductionRecord[]) =>
      rs.length ? rs.reduce((a, r) => a + r.actual_tonnes / Math.max(1, r.planned_tonnes), 0) / rs.length : 0;
    const mean = (f: (r: ProductionRecord) => number) =>
      rows.reduce((a, r) => a + f(r), 0) / rows.length;
    return [
      `${m.name} (${m.mine_id}, opencast, ${BELT_NAME[m.belt]}, ${m.district} ${m.state}, capacity ${m.nominal_capacity_tpd} tpd)`,
      `  achievement dry=${ratio(dry).toFixed(2)} monsoon=${ratio(monsoon).toFixed(2)}`,
      `  shortfall days ${(rows.filter((r) => r.shortfall_flag).length / rows.length * 100).toFixed(0)}%`,
      `  mean downtime hrs crusher=${mean((r) => r.downtime_hrs_crusher).toFixed(2)} loader=${mean((r) => r.downtime_hrs_loader).toFixed(2)}`,
      `  blast delay rate ${(rows.filter((r) => r.blast_delay_flag).length / rows.length * 100).toFixed(0)}%`,
      `  mean equipment availability ${mean((r) => r.equipment_available_pct).toFixed(1)}% attendance ${mean((r) => r.workers_present_pct).toFixed(1)}%`,
      `  monsoon 30-day cumulative rainfall ${monsoon.length ? (monsoon.reduce((a, r) => a + r.rain_cum_30, 0) / monsoon.length).toFixed(0) : 0} mm mean; worst recorded ${Math.max(0, ...rows.map((r) => r.rain_cum_30)).toFixed(0)} mm`,
      `  binding constraint by mean downtime: ${(() => {
        const c: Array<[string, number]> = [
          ['crusher', mean((r) => r.downtime_hrs_crusher)],
          ['loader', mean((r) => r.downtime_hrs_loader)],
        ];
        return c.sort((a, b) => b[1] - a[1])[0][0];
      })()}`,
    ].join('\n');
  }).filter(Boolean);

  const dates = records.map((r) => r.date).sort();
  return [
    `DATA SOURCE: real mines (Global Energy Monitor), synthetic production records`,
    `period ${dates[0]} to ${dates[dates.length - 1]}, ${records.length} mine-days`,
    `today is 2026-09-01; the monsoon window is roughly June to September`,
    ...byMine,
  ].join('\n');
}

export const usePlanStore = create<PlanState>((set, get) => ({
  records: [], mines: [], summary: null, status: 'idle', fileName: null, error: null,
  plan: null, planOrigin: null,
  selectedMineId: PLAN_MINES[0]?.mine_id ?? '', forecast: null, scenario: DEFAULT_SCENARIO, forecasting: false,

  loadSample: async () => {
    set({ status: 'validating', error: null });
    const [records, mines] = await Promise.all([
      adapter.getProduction('ALL', '0000-01-01', '9999-12-31'),
      Promise.resolve(PLAN_MINES),
    ]);
    set({
      records, mines, fileName: 'sample_production_iron_3y.csv',
      summary: summarise(records, [], []), status: 'ready',
    });
    await get().selectMine(get().selectedMineId);
  },

  ingest: (records, fileName, unknownColumns, missingColumns) => {
    const summary = summarise(records, unknownColumns, missingColumns);
    set({ records, fileName, summary, status: summary.ok ? 'ready' : 'idle', plan: null, planOrigin: null });
    if (summary.ok) {
      Promise.resolve(PLAN_MINES).then((mines) => {
        set({ mines });
        const first = summary.mines[0];
        if (first) void get().selectMine(first);
      });
    }
  },

  generatePlan: async () => {
    const { records, mines } = get();
    if (!records.length) return;
    set({ status: 'generating', error: null });
    try {
      const raw = await generate({
        prompt: 'Produce the production plan JSON for the operations summarised below.',
        system: PLAN_SYSTEM,
        context: briefFor(records, mines.length ? mines : PLAN_MINES),
        json: true,
      });
      const parsed = extractJson<ProductionPlan>(raw);
      if (parsed?.plan_steps?.length && parsed.corrective_actions?.length) {
        set({ plan: parsed, planOrigin: 'llm', status: 'done' });
        return;
      }
      throw new Error('unusable_response');
    } catch {
      // The demo never shows a parse error — fall back to the fixture plan.
      set({ plan: await adapter.getFallbackPlan(), planOrigin: 'fallback', status: 'done' });
    }
  },

  selectMine: async (selectedMineId) => {
    set({ selectedMineId, forecasting: true });
    const forecast = await adapter.getForecast(selectedMineId, 30, get().scenario);
    set({ forecast, forecasting: false });
  },

  setScenario: async (patch) => {
    const scenario = { ...get().scenario, ...patch };
    set({ scenario, forecasting: true });
    const forecast = await adapter.getForecast(get().selectedMineId, 30, scenario);
    set({ forecast, forecasting: false });
  },

  reset: () => set({
    records: [], summary: null, status: 'idle', fileName: null, plan: null,
    planOrigin: null, forecast: null, scenario: DEFAULT_SCENARIO, error: null,
  }),
}));
