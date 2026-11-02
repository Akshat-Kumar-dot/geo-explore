export type LandUseFlag = 'clear' | 'forest' | 'protected' | 'settlement' | 'water';

/** How close a GEM iron-mine point is to the polygon (Stage 1 tag). */
export type IronTag = '0km' | '1km' | '2km' | 'none';

/** A signed SHAP contribution for one input band. */
export interface ZoneDriver {
  /** Sentinel-2 feature name, e.g. fe3_ratio, fe_band_depth, ndvi_dry, slope */
  name: string;
  contribution: number;
}

/** A mapped mining polygon (Maus et al. 2022) inside one of the study belts. */
export interface Zone {
  /** Maus polygon id, e.g. IND00205. */
  zone_id: string;
  region_id: string;
  belt: string;
  iron_tag: IronTag;
  /** Nearest GEM iron mine; dist_to_mine_km is the distance to it. */
  nearest_mine: string;
  rank: number;
  /** 0-1 model probability of exposed iron-ore surface. NOT an Fe grade, NOT a confidence.
   *  Synthetic until the Stage 2 detector is trained. */
  score_mean: number;
  score_max: number;
  /** Real polygon area. */
  area_ha: number;
  top_features: ZoneDriver[];
  /** CONTEXT ONLY — excluded from the training feature set. Real (GEM). */
  dist_to_mine_km: number;
  dist_to_road_km: number;
  land_use_flag: LandUseFlag;
  centroid: [number, number];
  geometry: GeoJSON.Polygon;
  mock: true;
}

export interface Occurrence {
  occurrence_id: string;
  region_id: string;
  name: string;
  lat: number;
  lon: number;
  source: string;
}

/** Model card / provenance shown in the UI so nothing is unsourced. */
export interface Provenance {
  model_version: string;
  trained_at: string;
  label_count: number;
  heldout_count: number;
  cv_auc_mean: number;
  cv_auc_folds: number[];
  feature_count: number;
  source: 'synthetic' | 'production';
  excluded_features: string[];
}
