export type MineType = 'UG' | 'OC';

export interface Mine {
  /** GEM asset ID. */
  mine_id: string;
  name: string;
  /** GEM municipality (town), shown in the district slot. */
  district: string;
  state: string;
  belt: string;
  lat: number;
  lon: number;
  /** Indian iron ore is worked opencast; kept so the production model can branch. */
  mine_type: MineType;
  depth_m: number | null;
  nominal_capacity_tpd: number;
  /** GEM design capacity, thousand tonnes per annum. */
  capacity_ttpa: number | null;
  status: 'operating' | 'proposed' | 'mothballed' | string;
  coordinate_accuracy: 'exact' | 'approximate' | string;
  /** Distance to the nearest mapped mining polygon; over 2 km means no footprint is mapped. */
  nearest_polygon_km: number;
  wiki: string | null;
}

export interface Belt {
  id: string;
  name: string;
  states: string;
  role: 'train' | 'test';
  bbox: [number, number, number, number];
}
