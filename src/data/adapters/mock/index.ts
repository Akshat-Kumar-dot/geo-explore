import type { DataAdapter, ScenarioInput } from '../types';
import { IRON_MINES } from '../../fixtures/mines';
import { FALLBACK_PLAN } from '../../fixtures/fallbackPlan';
import {
  generateZones, generateOccurrences, generateConstraints,
  generateProduction, generateForecast, generateRecommendations, PROVENANCE,
} from './generate';

/** Small delay so skeleton loaders are exercised the same way they will be against a real API. */
const settle = <T,>(value: T, ms = 220): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

// Generated once per session — the seed makes this deterministic.
const zones = generateZones();
const occurrences = generateOccurrences();
const constraints = generateConstraints();
let productionCache: ReturnType<typeof generateProduction> | null = null;
const production = () => (productionCache ??= generateProduction('ALL'));

export const mockAdapter: DataAdapter = {
  getZones: () => settle(zones),
  getMines: () => settle(IRON_MINES),
  getOccurrences: () => settle(occurrences),
  getConstraints: () => settle(constraints),
  getProvenance: () => settle(PROVENANCE),
  getProduction: (mineId, from, to) =>
    settle(production().filter((r) =>
      (mineId === 'ALL' || r.mine_id === mineId) && r.date >= from && r.date <= to)),
  getForecast: (mineId, horizonDays, scenario?: ScenarioInput) =>
    settle(generateForecast(mineId, horizonDays, production(), scenario), 120),
  getRecommendations: (mineId) => settle(generateRecommendations(mineId)),
  getFallbackPlan: () => settle(FALLBACK_PLAN, 0),
};
