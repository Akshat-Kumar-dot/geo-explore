import { useMemo } from 'react';
import { create } from 'zustand';
import type { Zone, Mine, Occurrence, Provenance } from '../types';
import { adapter } from '../data/adapters';
import { REGION_ID } from '../data/fixtures/mines';

export type CentreView = 'map' | 'list' | 'analysis';

export interface LayerVisibility {
  zones: boolean;
  mines: boolean;
  occurrences: boolean;
  constraints: boolean;
  labels: boolean;
}

export interface Filters {
  minScore: number;
  excludeConstrained: boolean;
  maxRoadKm: number;
}

interface MapState {
  zones: Zone[];
  mines: Mine[];
  occurrences: Occurrence[];
  constraints: GeoJSON.FeatureCollection | null;
  provenance: Provenance | null;
  loading: boolean;
  error: string | null;

  selectedZoneId: string | null;
  /** Where the current selection came from, so the chat does not echo its own actions. */
  selectionSource: 'map' | 'chat' | 'keyboard' | 'list' | 'url' | null;
  hoveredZoneId: string | null;
  highlightedZoneIds: string[];
  centreView: CentreView;
  layers: LayerVisibility;
  filters: Filters;
  basemap: 'imagery' | 'terrain';
  /** Consumed by the map canvas, then cleared. */
  fitRequest: { ids: string[]; nonce: number } | null;

  load: () => Promise<void>;
  selectZone: (id: string | null, source?: 'map' | 'chat' | 'keyboard' | 'list' | 'url') => void;
  hoverZone: (id: string | null) => void;
  highlight: (ids: string[]) => void;
  setCentreView: (v: CentreView) => void;
  toggleLayer: (k: keyof LayerVisibility) => void;
  setLayer: (k: keyof LayerVisibility, visible: boolean) => void;
  setFilters: (patch: Partial<Filters>) => void;
  setBasemap: (b: 'imagery' | 'terrain') => void;
  requestFit: (ids: string[]) => void;
  clearFit: () => void;
  cycleRank: (delta: number) => void;
}

const DEFAULT_FILTERS: Filters = { minScore: 0.55, excludeConstrained: false, maxRoadKm: 25 };

export const useMapStore = create<MapState>((set, get) => ({
  zones: [], mines: [], occurrences: [], constraints: null, provenance: null,
  loading: true, error: null,
  selectedZoneId: null, selectionSource: null, hoveredZoneId: null, highlightedZoneIds: [],
  centreView: 'map',
  layers: { zones: true, mines: true, occurrences: true, constraints: true, labels: true },
  filters: DEFAULT_FILTERS,
  basemap: 'imagery',
  fitRequest: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [zones, mines, occurrences, constraints, provenance] = await Promise.all([
        adapter.getZones(REGION_ID),
        adapter.getMines(REGION_ID),
        adapter.getOccurrences(REGION_ID),
        adapter.getConstraints(REGION_ID),
        adapter.getProvenance(REGION_ID),
      ]);
      set({ zones, mines, occurrences, constraints, provenance, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  selectZone: (id, source = 'chat') => set({ selectedZoneId: id, selectionSource: id ? source : null }),
  hoverZone: (id) => set({ hoveredZoneId: id }),
  highlight: (ids) => set({ highlightedZoneIds: ids }),
  setCentreView: (centreView) => set({ centreView }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setLayer: (k, visible) => set((s) => ({ layers: { ...s.layers, [k]: visible } })),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  setBasemap: (basemap) => set({ basemap }),
  requestFit: (ids) => set({ fitRequest: { ids, nonce: Date.now() } }),
  clearFit: () => set({ fitRequest: null }),

  cycleRank: (delta) => {
    const visible = selectVisibleZones(get());
    if (!visible.length) return;
    const current = get().selectedZoneId;
    const i = visible.findIndex((z) => z.zone_id === current);
    const next = i === -1
      ? (delta > 0 ? 0 : visible.length - 1)
      : (i + delta + visible.length) % visible.length;
    set({ selectedZoneId: visible[next].zone_id, selectionSource: 'keyboard' });
  },
}));

/** The zone set the filters currently admit, always in rank order. */
export function selectVisibleZones(s: Pick<MapState, 'zones' | 'filters'>): Zone[] {
  const { minScore, excludeConstrained, maxRoadKm } = s.filters;
  return s.zones
    .filter((z) => z.score_mean >= minScore)
    .filter((z) => (excludeConstrained ? z.land_use_flag === 'clear' : true))
    .filter((z) => z.dist_to_road_km <= maxRoadKm)
    .sort((a, b) => a.rank - b.rank);
}

/** Memoised so the derived array stays referentially stable between renders. */
export const useVisibleZones = (): Zone[] => {
  const zones = useMapStore((s) => s.zones);
  const filters = useMapStore((s) => s.filters);
  return useMemo(() => selectVisibleZones({ zones, filters }), [zones, filters]);
};

export const useSelectedZone = () =>
  useMapStore((s) => s.zones.find((z) => z.zone_id === s.selectedZoneId) ?? null);
