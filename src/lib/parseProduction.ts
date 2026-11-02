import Papa from 'papaparse';
import type { ProductionRecord } from '../types';

export const REQUIRED_COLUMNS = [
  'date', 'mine_id', 'planned_tonnes', 'actual_tonnes',
  'equipment_available_pct', 'downtime_hrs_crusher', 'downtime_hrs_loader',
  'blasts_planned', 'blasts_executed', 'workers_present_pct', 'rainfall_mm',
] as const;

export const OPTIONAL_COLUMNS = [
  'downtime_hrs_hoist', 'blast_delay_flag', 'rain_cum_7', 'rain_cum_30',
  'soil_moisture', 'is_monsoon', 'shortfall_flag',
] as const;

const KNOWN = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

const n = (v: unknown, fallback = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};
const b = (v: unknown) => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
};

export interface ParseResult {
  rows: ProductionRecord[];
  unknownColumns: string[];
  missingColumns: string[];
}

/** Client-side parse. Derives the optional columns when a file omits them. */
export function parseProductionCsv(text: string): ParseResult {
  const out = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
    comments: '#',
  });

  const headers = (out.meta.fields ?? []).map((h) => h.trim().toLowerCase());
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
  const unknownColumns = headers.filter((h) => h && !KNOWN.has(h));
  if (missingColumns.length) return { rows: [], unknownColumns, missingColumns };

  // Rolling rainfall windows, per mine, when the file does not carry them.
  const win = new Map<string, number[]>();

  const rows = (out.data ?? [])
    .filter((r) => r && r.date && r.mine_id)
    .map((r) => {
      const mine = String(r.mine_id).trim().toUpperCase();
      const rainfall_mm = n(r.rainfall_mm);
      const hist = win.get(mine) ?? [];
      hist.push(rainfall_mm);
      if (hist.length > 30) hist.shift();
      win.set(mine, hist);
      const sum = (k: number) => +hist.slice(-k).reduce((a, x) => a + x, 0).toFixed(1);

      const date = String(r.date).trim();
      const month = new Date(date).getUTCMonth();
      const planned_tonnes = n(r.planned_tonnes);
      const actual_tonnes = n(r.actual_tonnes);
      const blasts_planned = n(r.blasts_planned);
      const blasts_executed = n(r.blasts_executed);
      const hoistRaw = r.downtime_hrs_hoist;

      return {
        date,
        mine_id: mine,
        planned_tonnes,
        actual_tonnes,
        equipment_available_pct: n(r.equipment_available_pct),
        downtime_hrs_crusher: n(r.downtime_hrs_crusher),
        downtime_hrs_loader: n(r.downtime_hrs_loader),
        downtime_hrs_hoist:
          hoistRaw === undefined || hoistRaw === '' || hoistRaw === null ? null : n(hoistRaw),
        blasts_planned,
        blasts_executed,
        blast_delay_flag:
          r.blast_delay_flag !== undefined ? b(r.blast_delay_flag) : blasts_executed < blasts_planned,
        workers_present_pct: n(r.workers_present_pct),
        rainfall_mm,
        rain_cum_7: r.rain_cum_7 !== undefined ? n(r.rain_cum_7) : sum(7),
        rain_cum_30: r.rain_cum_30 !== undefined ? n(r.rain_cum_30) : sum(30),
        soil_moisture: n(r.soil_moisture, 0),
        is_monsoon: r.is_monsoon !== undefined ? b(r.is_monsoon) : month >= 5 && month <= 8,
        shortfall_flag:
          r.shortfall_flag !== undefined ? b(r.shortfall_flag) : actual_tonnes < planned_tonnes * 0.9,
      } satisfies ProductionRecord;
    })
    .filter((r) => !Number.isNaN(new Date(r.date).getTime()));

  return { rows, unknownColumns, missingColumns };
}
