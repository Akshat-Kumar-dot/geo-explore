import { useMapStore } from '../stores/mapStore';
import { usePlanStore } from '../stores/planStore';
import { useRouteStore } from '../stores/routeStore';
import { exportZonesCsv } from './exportCsv';
import { mapRef } from '../components/map/MapCanvas';
import type { LayerVisibility } from '../stores/mapStore';

/**
 * The command surface the assistant is allowed to drive. Everything the user can
 * do with the mouse, the model can request — and nothing beyond it.
 */
export type ChatAction =
  | { type: 'select_zone'; zone_id: string }
  | { type: 'zoom_to_zones'; zone_ids: string[] }
  | { type: 'clear_selection' }
  | { type: 'fly_to'; lon: number; lat: number; zoom?: number; label?: string }
  | { type: 'select_mine'; mine_id: string }
  | { type: 'set_layer'; layer: keyof LayerVisibility; visible: boolean }
  | { type: 'set_basemap'; basemap: 'imagery' | 'terrain' }
  | { type: 'set_filter'; minScore?: number; maxRoadKm?: number; excludeConstrained?: boolean }
  | { type: 'reset_filters' }
  | { type: 'set_panel'; panel: 'map' | 'list' | 'analysis' }
  | { type: 'set_screen'; screen: 'map' | 'plan' }
  | { type: 'set_scenario'; rainfallScale?: number; equipmentPct?: number }
  | { type: 'generate_plan' }
  | { type: 'load_sample_data' }
  | { type: 'export_zones'; zone_ids?: string[] }
  | { type: 'fit_study_area' };

/** Human-readable trace shown under the reply, so the user sees what changed. */
export function describeAction(a: ChatAction): string | null {
  switch (a.type) {
    case 'select_zone': return `Selected ${a.zone_id}`;
    case 'zoom_to_zones': return `Zoomed to ${a.zone_ids.length} zone${a.zone_ids.length === 1 ? '' : 's'}`;
    case 'clear_selection': return 'Cleared the selection';
    case 'fly_to': return `Moved the map to ${a.label ?? `${a.lat.toFixed(3)}, ${a.lon.toFixed(3)}`}`;
    case 'select_mine': return `Switched the production view to ${a.mine_id}`;
    case 'set_layer': return `${a.visible ? 'Showed' : 'Hid'} the ${a.layer} layer`;
    case 'set_basemap': return `Basemap set to ${a.basemap}`;
    case 'set_filter': {
      const bits = [
        a.minScore !== undefined ? `min score ${a.minScore.toFixed(2)}` : null,
        a.maxRoadKm !== undefined ? `within ${a.maxRoadKm} km of a road` : null,
        a.excludeConstrained !== undefined ? (a.excludeConstrained ? 'excluding constrained ground' : 'including constrained ground') : null,
      ].filter(Boolean);
      return bits.length ? `Filtered: ${bits.join(', ')}` : null;
    }
    case 'reset_filters': return 'Reset the filters';
    case 'set_panel': return `Opened the ${a.panel === 'map' ? 'map' : a.panel} view`;
    case 'set_screen': return `Switched to the ${a.screen === 'plan' ? 'production plan' : 'map'} screen`;
    case 'set_scenario': {
      const bits = [
        a.rainfallScale !== undefined ? `rainfall ${(a.rainfallScale * 100).toFixed(0)}% of climatology` : null,
        a.equipmentPct !== undefined ? `equipment availability ${a.equipmentPct}%` : null,
      ].filter(Boolean);
      return bits.length ? `Re-forecast with ${bits.join(', ')}` : null;
    }
    case 'generate_plan': return 'Generated the production plan';
    case 'load_sample_data': return 'Loaded the sample production data';
    case 'export_zones': return 'Exported the target list';
    case 'fit_study_area': return 'Zoomed out to the study area';
    default: return null;
  }
}

/** Executes one action against the stores. Unknown or malformed actions are ignored. */
export async function runAction(a: ChatAction): Promise<void> {
  const map = useMapStore.getState();
  const plan = usePlanStore.getState();
  const route = useRouteStore.getState();

  switch (a.type) {
    case 'select_zone': {
      if (!map.zones.some((z) => z.zone_id === a.zone_id)) return;
      route.go('map');
      map.setCentreView('map');
      map.selectZone(a.zone_id);
      return;
    }
    case 'zoom_to_zones': {
      const ids = a.zone_ids.filter((id) => map.zones.some((z) => z.zone_id === id));
      if (!ids.length) return;
      route.go('map');
      map.setCentreView('map');
      map.highlight(ids);
      map.requestFit(ids);
      return;
    }
    case 'clear_selection': return map.selectZone(null);
    case 'fly_to': {
      route.go('map');
      map.setCentreView('map');
      mapRef.current?.easeTo({ center: [a.lon, a.lat], zoom: a.zoom ?? 10.5, duration: 900 });
      return;
    }
    case 'select_mine': {
      if (!map.mines.some((m) => m.mine_id === a.mine_id)) return;
      if (plan.records.length) await plan.selectMine(a.mine_id);
      return;
    }
    case 'set_layer': return map.setLayer(a.layer, a.visible);
    case 'set_basemap': return map.setBasemap(a.basemap);
    case 'set_filter': {
      const patch: Record<string, number | boolean> = {};
      if (a.minScore !== undefined) patch.minScore = Math.min(0.95, Math.max(0.55, a.minScore));
      if (a.maxRoadKm !== undefined) patch.maxRoadKm = Math.min(25, Math.max(1, a.maxRoadKm));
      if (a.excludeConstrained !== undefined) patch.excludeConstrained = a.excludeConstrained;
      return map.setFilters(patch);
    }
    case 'reset_filters':
      return map.setFilters({ minScore: 0.55, excludeConstrained: false, maxRoadKm: 25 });
    case 'set_panel': {
      route.go('map');
      return map.setCentreView(a.panel);
    }
    case 'set_screen': return route.go(a.screen);
    case 'set_scenario': {
      if (!plan.records.length) return;
      const patch: { rainfallScale?: number; equipmentPct?: number } = {};
      if (a.rainfallScale !== undefined) patch.rainfallScale = Math.min(2, Math.max(0, a.rainfallScale));
      if (a.equipmentPct !== undefined) patch.equipmentPct = Math.min(100, Math.max(50, a.equipmentPct));
      await plan.setScenario(patch);
      return;
    }
    case 'generate_plan': {
      route.go('plan');
      if (!plan.records.length) await plan.loadSample();
      await usePlanStore.getState().generatePlan();
      return;
    }
    case 'load_sample_data': {
      route.go('plan');
      if (!plan.records.length) await plan.loadSample();
      return;
    }
    case 'export_zones': {
      const set = a.zone_ids?.length
        ? map.zones.filter((z) => a.zone_ids!.includes(z.zone_id))
        : map.zones;
      return exportZonesCsv(set);
    }
    case 'fit_study_area': {
      map.selectZone(null);
      map.requestFit([]);
      return;
    }
  }
}

export async function runActions(actions: ChatAction[]): Promise<string[]> {
  const trace: string[] = [];
  for (const a of actions.slice(0, 6)) {
    try {
      await runAction(a);
      const d = describeAction(a);
      if (d) trace.push(d);
    } catch {
      // A bad action must never break the reply.
    }
  }
  return trace;
}
