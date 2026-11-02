import type { ZoneDriver } from './zones';

export interface ProductionRecord {
  date: string;
  mine_id: string;
  planned_tonnes: number;
  actual_tonnes: number;
  equipment_available_pct: number;
  downtime_hrs_crusher: number;
  downtime_hrs_loader: number;
  downtime_hrs_hoist: number | null;
  blasts_planned: number;
  blasts_executed: number;
  blast_delay_flag: boolean;
  workers_present_pct: number;
  rainfall_mm: number;
  rain_cum_7: number;
  rain_cum_30: number;
  soil_moisture: number;
  is_monsoon: boolean;
  shortfall_flag: boolean;
}

export interface ForecastPoint {
  date: string;
  p10: number;
  p50: number;
  p90: number;
  planned: number;
}

export interface Forecast {
  mine_id: string;
  generated_at: string;
  horizon_days: number;
  points: ForecastPoint[];
  shortfall_probability: number;
  drivers: ZoneDriver[];
}

export interface Recommendation {
  rank: number;
  action: string;
  driver: string;
  expected_recovery_tonnes: number;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

/* ---- Structured plan returned by the LLM (Screen 2) ---- */

export interface PlanStep {
  step: number;
  title: string;
  activities: string[];
  timeline: string;
  status: 'completed' | 'in_progress' | 'not_started';
}

export interface RiskDriver {
  factor: string;
  influence_pct: number;
  direction: 'positive' | 'negative';
}

export interface ProjectedShortfall {
  probability: number;
  expected_gap_tonnes: number;
  horizon_days: number;
}

export interface CorrectiveAction {
  rank: number;
  action: string;
  driver: string;
  expected_recovery_tonnes: number;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface ProductionPlan {
  plan_steps: PlanStep[];
  risk_drivers: RiskDriver[];
  projected_shortfall: ProjectedShortfall;
  corrective_actions: CorrectiveAction[];
}
