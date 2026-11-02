import { useEffect, useRef } from 'react';
import { useMapStore } from '../stores/mapStore';
import { useRouteStore } from '../stores/routeStore';
import { explainZoneInChat } from './explainZone';

/**
 * Two-way sync between the URL and app state, so ?zone=Z-026&view=map
 * reproduces an exact screen for a screenshot or the demo video.
 */
export function useUrlSync() {
  const applied = useRef(false);
  const zones = useMapStore((s) => s.zones);
  const selectedZoneId = useMapStore((s) => s.selectedZoneId);
  const centreView = useMapStore((s) => s.centreView);
  const view = useRouteStore((s) => s.view);

  // URL → state, once the zone set has loaded.
  useEffect(() => {
    if (applied.current || !zones.length) return;
    applied.current = true;
    const p = new URLSearchParams(window.location.search);
    const zone = p.get('zone');
    if (zone && zones.some((z) => z.zone_id === zone)) {
      // A deep link is meant to reproduce a whole screen, explanation included.
      useMapStore.getState().selectZone(zone, 'url');
      explainZoneInChat(zone);
    }
    const panel = p.get('panel');
    if (panel === 'list' || panel === 'analysis') useMapStore.getState().setCentreView(panel);
  }, [zones]);

  // state → URL
  useEffect(() => {
    if (!applied.current) return;
    const p = new URLSearchParams(window.location.search);
    view === 'plan' ? p.set('view', 'plan') : p.delete('view');
    selectedZoneId ? p.set('zone', selectedZoneId) : p.delete('zone');
    centreView === 'map' ? p.delete('panel') : p.set('panel', centreView);
    const qs = p.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    if (next !== window.location.pathname + window.location.search)
      window.history.replaceState(null, '', next);
  }, [selectedZoneId, centreView, view]);
}
