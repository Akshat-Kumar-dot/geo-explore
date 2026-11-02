import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Map as MLMap, LngLatBounds, type MapMouseEvent, type MapGeoJSONFeature } from 'maplibre-gl';
import { useMapStore, selectVisibleZones } from '../../stores/mapStore';
import { scoreRampExpression } from '../../lib/colors';
import { hatchImage } from '../../lib/mapImages';
import { AOI_BBOX } from '../../data/fixtures/mines';
import { explainZoneInChat } from '../../lib/explainZone';
import type { Zone, Mine } from '../../types';
import './markers.css';

/** Shared handle so chrome outside the canvas (zoom, locate) can drive the map. */
export const mapRef: { current: MLMap | null } = { current: null };

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const zonesToGeoJSON = (zones: Zone[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: zones.map((z) => ({
    type: 'Feature',
    id: z.rank,
    properties: {
      zone_id: z.zone_id, rank: z.rank, score_mean: z.score_mean, nearest_mine: z.nearest_mine,
      land_use_flag: z.land_use_flag, constrained: z.land_use_flag !== 'clear' ? 1 : 0,
      top5: z.rank <= 5 ? 1 : 0,
    },
    geometry: z.geometry,
  })),
});

const BASEMAPS: Record<'imagery' | 'terrain', { tiles: string[]; attribution: string }> = {
  imagery: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] as string[],
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  terrain: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Terrain © Esri',
  },
};

/** Mine names only appear once zoomed in; 160 labels at belt scale would bury the polygons. */
const MINE_LABEL_ZOOM = 11;

function mineGlyph(mine: Mine) {
  const el = document.createElement('div');
  el.className = 'mine-marker';
  const operating = mine.status === 'operating';
  const shape = operating
    ? `<polygon points="9,2 17,16 1,16" fill="#ffffff" stroke="#0d1620" stroke-width="1.6" stroke-linejoin="round"/>`
    : `<polygon points="9,2 17,16 1,16" fill="rgba(255,255,255,0.25)" stroke="#ffffff" stroke-width="1.6" stroke-dasharray="3 2" stroke-linejoin="round"/>`;
  el.innerHTML =
    `<svg class="mine-glyph" width="16" height="16" viewBox="0 0 18 18">${shape}</svg>` +
    `<span class="map-label mine-label">${mine.name}</span>`;
  el.title = `${mine.name} — ${mine.status} iron ore mine, ${mine.district}, ${mine.state}` +
    (mine.capacity_ttpa ? ` · design capacity ${mine.capacity_ttpa.toLocaleString('en-IN')} kt/yr` : '');
  return el;
}

export default function MapCanvas({ hidden = false }: { hidden?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const ready = useRef(false);
  const markers = useRef<maplibregl.Marker[]>([]);
  const zoneMarkers = useRef<maplibregl.Marker[]>([]);
  const popup = useRef<maplibregl.Popup | null>(null);

  const basemap = useMapStore((s) => s.basemap);

  /* ---------------------------- init ---------------------------- */
  useEffect(() => {
    if (!ref.current || map.current) return;
    const m = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: {
          basemap: { type: 'raster', tileSize: 256, maxzoom: 17, ...BASEMAPS.imagery },
        },
        layers: [
          { id: 'basemap', type: 'raster', source: 'basemap' },
        ],
      },
      bounds: AOI_BBOX as [number, number, number, number],
      fitBoundsOptions: { padding: 56 },
      maxZoom: 15,
      minZoom: 5,
      dragRotate: false,
      attributionControl: false,
    });
    map.current = m;
    mapRef.current = m;
    if (import.meta.env.DEV) (window as unknown as { __map?: MLMap }).__map = m;
    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    m.touchZoomRotate.disableRotation();
    const labelByZoom = () => m.getContainer().classList.toggle('show-mine-labels', m.getZoom() >= MINE_LABEL_ZOOM);
    m.on('zoom', labelByZoom);
    labelByZoom();

    m.on('load', () => {
      m.addImage('constraint-hatch', hatchImage(), { pixelRatio: 2 });

      m.addSource('constraints', { type: 'geojson', data: EMPTY });
      m.addSource('zones', { type: 'geojson', data: EMPTY });
      m.addSource('occurrences', { type: 'geojson', data: EMPTY });

      m.addLayer({
        id: 'constraints-fill', type: 'fill', source: 'constraints',
        paint: { 'fill-pattern': 'constraint-hatch', 'fill-opacity': 0.42 },
      });
      m.addLayer({
        id: 'constraints-line', type: 'line', source: 'constraints',
        paint: { 'line-color': '#ffe2a8', 'line-width': 1, 'line-dasharray': [4, 3], 'line-opacity': 0.55 },
      });

      m.addLayer({
        id: 'zones-fill', type: 'fill', source: 'zones',
        paint: {
          'fill-color': scoreRampExpression() as never,
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'dimmed'], false], 0.18,
            ['boolean', ['feature-state', 'hover'], false], 0.78,
            0.62,
          ],
        },
      });
      m.addLayer({
        id: 'zones-line', type: 'line', source: 'zones',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#ffffff',
            ['==', ['get', 'top5'], 1], '#fff4d6',
            '#e8f6fa',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 3,
            ['==', ['get', 'top5'], 1], 2.4,
            1.1,
          ],
          'line-opacity': ['case', ['boolean', ['feature-state', 'dimmed'], false], 0.25, 0.95],
        },
      });
      m.addLayer({
        id: 'zones-glow', type: 'line', source: 'zones',
        filter: ['==', ['get', 'zone_id'], '__none__'],
        paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-blur': 9, 'line-opacity': 0.5 },
      }, 'zones-line');

      m.addLayer({
        id: 'occurrences', type: 'circle', source: 'occurrences',
        paint: {
          'circle-radius': 4.5,
          'circle-color': '#d4145a',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.4,
          'circle-opacity': 0.95,
        },
      });

      ready.current = true;
      syncAll();
      m.resize();
    });

    /* hover + click */
    let hoveredRank: number | null = null;
    const clearHover = () => {
      if (hoveredRank !== null)
        m.setFeatureState({ source: 'zones', id: hoveredRank }, { hover: false });
      hoveredRank = null;
    };

    m.on('mousemove', 'zones-fill', (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      m.getCanvas().style.cursor = 'pointer';
      if (hoveredRank !== f.id) {
        clearHover();
        hoveredRank = f.id as number;
        m.setFeatureState({ source: 'zones', id: hoveredRank }, { hover: true });
      }
      useMapStore.getState().hoverZone(String(f.properties?.zone_id));
      popup.current ??= new maplibregl.Popup({
        closeButton: false, closeOnClick: false, offset: 12, className: 'zone-tip',
      });
      popup.current
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="px-2.5 py-1.5 text-[11.5px] leading-tight">
             <div class="font-semibold text-ink">${f.properties?.zone_id}</div>
             <div class="text-muted num">Rank ${f.properties?.rank} · Model score ${Number(f.properties?.score_mean).toFixed(2)} (synthetic)</div>
             <div class="text-muted">Nearest GEM mine: ${f.properties?.nearest_mine}</div>
             <div class="text-[10px] text-[#93a0b1] mt-0.5">Double-click for details</div>
           </div>`,
        )
        .addTo(m);
    });

    m.on('mouseleave', 'zones-fill', () => {
      m.getCanvas().style.cursor = '';
      clearHover();
      useMapStore.getState().hoverZone(null);
      popup.current?.remove();
    });

    m.on('click', 'zones-fill', (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const id = e.features?.[0]?.properties?.zone_id;
      if (id) useMapStore.getState().selectZone(String(id), 'map');
    });

    // Double tap on a zone opens its detail in the chat instead of zooming.
    m.on('dblclick', 'zones-fill', (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      const id = e.features?.[0]?.properties?.zone_id;
      if (!id) return;
      e.preventDefault();
      useMapStore.getState().selectZone(String(id), 'map');
      explainZoneInChat(String(id));
    });

    m.on('click', (e: MapMouseEvent) => {
      const hits = m.queryRenderedFeatures(e.point, { layers: ['zones-fill'] });
      if (!hits.length) useMapStore.getState().selectZone(null, 'map');
    });

    return () => { m.remove(); map.current = null; mapRef.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------- basemap -------------------------- */
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const src = m.getSource('basemap') as maplibregl.RasterTileSource | undefined;
    src?.setTiles?.([...BASEMAPS[basemap].tiles]);
    m.getStyle();
  }, [basemap]);

  /* ------------------------ data + state ------------------------ */
  function syncAll() {
    const m = map.current;
    if (!m || !ready.current) return;
    const s = useMapStore.getState();
    const visible = selectVisibleZones(s);

    (m.getSource('zones') as maplibregl.GeoJSONSource | undefined)
      ?.setData(zonesToGeoJSON(s.layers.zones ? visible : []));
    (m.getSource('constraints') as maplibregl.GeoJSONSource | undefined)
      ?.setData(s.layers.constraints && s.constraints ? s.constraints : EMPTY);
    (m.getSource('occurrences') as maplibregl.GeoJSONSource | undefined)?.setData(
      s.layers.occurrences
        ? {
            type: 'FeatureCollection',
            features: s.occurrences.map((o) => ({
              type: 'Feature' as const,
              properties: { name: o.name },
              geometry: { type: 'Point' as const, coordinates: [o.lon, o.lat] },
            })),
          }
        : EMPTY,
    );

    // Mine markers
    markers.current.forEach((mk) => mk.remove());
    markers.current = s.layers.mines
      ? s.mines.map((mine) =>
          new maplibregl.Marker({ element: mineGlyph(mine), anchor: 'center' })
            .setLngLat([mine.lon, mine.lat])
            .addTo(m))
      : [];

    // Zone rank labels
    zoneMarkers.current.forEach((mk) => mk.remove());
    zoneMarkers.current = s.layers.labels && s.layers.zones
      ? visible.map((z) => {
          const el = document.createElement('div');
          el.className = `map-label zone-label${z.rank <= 20 ? ' zone-label-top' : ''}`;
          el.textContent =
            z.land_use_flag === 'clear' ? `${z.rank}` : `⚠ ${z.rank}`;
          return new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat(z.centroid).addTo(m);
        })
      : [];

    applySelection();
  }

  function applySelection() {
    const m = map.current;
    if (!m || !ready.current) return;
    const s = useMapStore.getState();
    const visible = selectVisibleZones(s);
    const selected = visible.find((z) => z.zone_id === s.selectedZoneId) ?? null;

    for (const z of visible) {
      m.setFeatureState({ source: 'zones', id: z.rank }, {
        selected: selected?.zone_id === z.zone_id,
        dimmed: Boolean(selected) && selected!.zone_id !== z.zone_id,
      });
    }
    m.setFilter('zones-glow', ['==', ['get', 'zone_id'], selected?.zone_id ?? '__none__']);
  }

  useEffect(() => {
    const unsub = useMapStore.subscribe((s, prev) => {
      if (!ready.current) return;
      if (s.zones !== prev.zones || s.constraints !== prev.constraints ||
          s.occurrences !== prev.occurrences || s.mines !== prev.mines ||
          s.layers !== prev.layers || s.filters !== prev.filters) {
        syncAll();
      } else if (s.selectedZoneId !== prev.selectedZoneId) {
        applySelection();
      }
    });
    syncAll();
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------- ease to the selected zone / fit sets ------------ */
  const selectedZoneId = useMapStore((s) => s.selectedZoneId);
  useEffect(() => {
    const m = map.current;
    if (!m || !selectedZoneId) return;
    const z = useMapStore.getState().zones.find((x) => x.zone_id === selectedZoneId);
    if (!z) return;
    m.easeTo({
      center: z.centroid,
      zoom: Math.max(m.getZoom(), 10.2),
      duration: 850,
      padding: { left: 0, right: 340, top: 0, bottom: 0 },
    });
  }, [selectedZoneId]);

  const fitRequest = useMapStore((s) => s.fitRequest);
  useEffect(() => {
    const m = map.current;
    if (!m || !fitRequest) return;
    const state = useMapStore.getState();
    // An empty id list means "frame everything currently visible".
    const target = fitRequest.ids.length
      ? state.zones.filter((z) => fitRequest.ids.includes(z.zone_id))
      : selectVisibleZones(state);
    if (!target.length) return;
    const b = new LngLatBounds();
    target.forEach((z) => z.geometry.coordinates[0].forEach((c) => b.extend(c as [number, number])));
    m.fitBounds(b, { padding: { top: 90, bottom: 90, left: 90, right: 360 }, duration: 900, maxZoom: 11.5 });
    useMapStore.getState().clearFit();
  }, [fitRequest]);

  return (
    <div
      ref={ref}
      aria-hidden={hidden}
      className="absolute inset-0 basemap-treat"
      style={{ visibility: hidden ? 'hidden' : 'visible' }}
    />
  );
}
