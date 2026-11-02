import type {
  Zone, Mine, Occurrence, Provenance,
  ProductionRecord, Forecast, Recommendation, ProductionPlan,
} from '../../types';

export interface ScenarioInput {
  /** Multiplier on the rainfall envelope. 1 = climatology. */
  rainfallScale: number;
  /** Target equipment availability, percent. */
  equipmentPct: number;
}

export interface DataAdapter {
  getZones(regionId: string): Promise<Zone[]>;
  getMines(regionId: string): Promise<Mine[]>;
  getOccurrences(regionId: string): Promise<Occurrence[]>;
  getConstraints(regionId: string): Promise<GeoJSON.FeatureCollection>;
  getProvenance(regionId: string): Promise<Provenance>;
  getProduction(mineId: string, from: string, to: string): Promise<ProductionRecord[]>;
  getForecast(mineId: string, horizonDays: number, scenario?: ScenarioInput): Promise<Forecast>;
  getRecommendations(mineId: string): Promise<Recommendation[]>;
  /** Fallback plan used when the LLM is unavailable or returns unparseable output. */
  getFallbackPlan(): Promise<ProductionPlan>;
}
