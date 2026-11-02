/**
 * Writes public/sample_production_iron_12m.csv, the reference file offered on the
 * production-plan screen, from the same seeded generator the app uses.
 * Run: npx tsx pipeline/make_sample_production.ts
 */
import { writeFileSync } from 'node:fs';
import { generateProduction } from '../src/data/adapters/mock/generate';
import { PLAN_MINES } from '../src/data/fixtures/mines';
import { toCsv } from '../src/lib/exportCsv';

const rows = generateProduction('ALL').filter((r) => r.date >= '2025-09-01');
const header =
  '# GeoExplore sample production data - ten opencast iron ore mines\n' +
  `# Mines (real, Global Energy Monitor): ${PLAN_MINES.map((m) => `${m.mine_id} ${m.name}`).join('; ')}\n` +
  '# SYNTHETIC production records generated from a seeded model. Not measurements.\n' +
  '# downtime_hrs_hoist is intentionally empty: every mine here is opencast.\n';
const csv = toCsv(rows.map((r) => ({ ...r, downtime_hrs_hoist: r.downtime_hrs_hoist ?? '' })));
writeFileSync(new URL('../public/sample_production_iron_12m.csv', import.meta.url), header + csv + '\n');
console.log(`Wrote ${rows.length} rows for ${PLAN_MINES.length} mines`);
