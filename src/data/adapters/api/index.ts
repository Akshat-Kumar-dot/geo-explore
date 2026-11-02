import type { DataAdapter, ScenarioInput } from '../types';
import { FALLBACK_PLAN } from '../../fixtures/fallbackPlan';

/**
 * Real-backend adapter. Stubbed against the endpoint shapes the ML pipeline
 * will expose; enabling it is a single env var (VITE_DATA_SOURCE=api).
 * No component changes are needed to switch over.
 */
const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const apiAdapter: DataAdapter = {
  getZones: (regionId) => get(`/regions/${regionId}/zones`),
  getMines: (regionId) => get(`/regions/${regionId}/mines`),
  getOccurrences: (regionId) => get(`/regions/${regionId}/occurrences`),
  getConstraints: (regionId) => get(`/regions/${regionId}/constraints`),
  getProvenance: (regionId) => get(`/regions/${regionId}/model`),
  getProduction: (mineId, from, to) => get('/production', { mine_id: mineId, from, to }),
  getForecast: (mineId, horizonDays, scenario?: ScenarioInput) =>
    get('/forecast', {
      mine_id: mineId,
      horizon_days: horizonDays,
      ...(scenario ? { rainfall_scale: scenario.rainfallScale, equipment_pct: scenario.equipmentPct } : {}),
    }),
  getRecommendations: (mineId) => get('/recommendations', { mine_id: mineId }),
  getFallbackPlan: async () => FALLBACK_PLAN,
};
