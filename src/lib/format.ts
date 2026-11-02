const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-IN', opts);

export const num = (v: number, digits = 0) =>
  nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

export const tonnes = (v: number) => `${num(Math.round(v))} t`;

export const pct = (v: number, digits = 0) => `${num(v * 100, digits)}%`;

/** Model probabilities are shown as 0-1 to three places — never as a "confidence %". */
export const score = (v: number) => v.toFixed(2);

export const hectares = (v: number) => `${num(v)} ha`;

export const kmDist = (v: number) => `${v.toFixed(1)} km`;

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

export const monthDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** iron_oxide → Iron oxide; rain_cum_30 → Rain cum 30 */
export const humanFeature = (name: string) => {
  const map: Record<string, string> = {
    fe_band_depth: '0.9 µm Fe absorption depth',
    fe3_ratio: 'Ferric-iron ratio (B4/B2)',
    fe_oxide_swir: 'Iron-oxide ratio (B11/B8A)',
    bsi: 'Bare-soil index',
    bare_change: 'Bare-surface change (two dry seasons)',
    texture: 'Surface texture (GLCM)',
    iron_oxide: 'Ferric-oxide ratio',
    ferrous: 'Ferrous-iron index',
    clay: 'Clay / laterite ratio (B11/B12)',
    ndvi_dry: 'NDVI (dry season)',
    ndvi_min: 'NDVI (annual minimum)',
    lst: 'Land-surface temperature',
    elevation: 'Elevation',
    slope: 'Slope',
    curvature: 'Profile curvature',
    twi: 'Topographic wetness index',
    lineament_density: 'Lineament density',
    dist_lineament: 'Distance to lineament',
    pc1: 'Principal component 1',
    pc2: 'Principal component 2',
    litho_code: 'Mapped lithology',
    rain_cum_30: 'Cumulative rainfall (30-day)',
    rain_cum_7: 'Cumulative rainfall (7-day)',
    downtime_hrs_crusher: 'Crusher downtime',
    downtime_hrs_loader: 'Loader downtime',
    downtime_hrs_hoist: 'Hoist downtime',
    blast_delay_flag: 'Blast delays',
    blasts_executed: 'Blasts executed',
    equipment_available_pct: 'Equipment availability',
    workers_present_pct: 'Workforce attendance',
    soil_moisture: 'Soil moisture',
    planned_tonnes: 'Planned tonnage',
  };
  return map[name] ?? name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
};

export const IRON_TAG_LABEL: Record<string, string> = {
  '0km': 'GEM mine inside',
  '1km': 'GEM mine ≤ 1 km',
  '2km': 'GEM mine ≤ 2 km',
  none: 'No GEM mine ≤ 2 km',
};

export const LAND_USE_LABEL: Record<string, string> = {
  clear: 'Clear',
  forest: 'Forest cover',
  protected: 'Protected area',
  settlement: 'Settlement',
  water: 'Water body',
};
