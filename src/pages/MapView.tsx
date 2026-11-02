import { useEffect } from 'react';
import AppShell from '../components/shell/AppShell';
import MapCanvas, { mapRef } from '../components/map/MapCanvas';
import MapControls from '../components/map/MapControls';
import MapLegend from '../components/map/MapLegend';
import ScaleBar from '../components/map/ScaleBar';
import IndiaInset from '../components/map/IndiaInset';
import ZoneList from '../components/map/ZoneList';
import AnalysisPanel from '../components/analysis/AnalysisPanel';
import { useMapStore, useVisibleZones } from '../stores/mapStore';
import { AOI_BBOX, BELTS } from '../data/fixtures/mines';
import { num } from '../lib/format';
import { explainZoneInChat } from '../lib/explainZone';

export default function MapView() {
  const centreView = useMapStore((s) => s.centreView);
  const loading = useMapStore((s) => s.loading);
  const visible = useVisibleZones();

  // Arrows cycle targets by rank; Escape deselects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { useMapStore.getState().selectZone(null); return; }
      if (e.key === 'Enter') {
        const id = useMapStore.getState().selectedZoneId;
        if (id) { e.preventDefault(); explainZoneInChat(id); }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); useMapStore.getState().cycleRank(1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); useMapStore.getState().cycleRank(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <AppShell screen="map">
      <div className="absolute inset-0">
          <MapCanvas hidden={centreView !== 'map'} />

          {centreView === 'list' && <ZoneList />}
          {centreView === 'analysis' && <AnalysisPanel />}

          {centreView === 'map' && (
            <>
              {/* Top-left: what the filters are currently admitting, and a jump to each belt */}
              <div className="absolute top-4 left-4 flex flex-wrap items-center gap-1.5 pointer-events-auto max-w-[calc(100%-120px)]">
                <div className="h-9 px-3 grid place-items-center rounded-lg bg-white/95 backdrop-blur-[2px] border border-lineStrong shadow-card text-[12px] text-[#54637a] num">
                  {loading ? 'Loading targets…' : `${num(visible.length)} iron-ore targets`}
                </div>
                {BELTS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => mapRef.current?.fitBounds(b.bbox, { padding: 56, duration: 800 })}
                    title={`${b.states} · ${b.role === 'train' ? 'training belt' : 'held-out test belt'}`}
                    className="h-9 px-3 rounded-lg bg-white/95 backdrop-blur-[2px] border border-lineStrong shadow-card text-[12px] text-ink hover:bg-white transition-colors whitespace-nowrap"
                  >
                    {b.name}
                    <span className="ml-1.5 text-[10px] uppercase tracking-[0.06em] text-[#8593a6]">{b.role}</span>
                  </button>
                ))}
              </div>

              {/* Right: map controls */}
              <div className="absolute top-4 right-4 pointer-events-auto">
                <MapControls
                  onZoom={(d) => (d > 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut())}
                  onLocate={() => mapRef.current?.fitBounds(AOI_BBOX, { padding: 56, duration: 800 })}
                />
              </div>


              {/* Bottom-left: legend + scale */}
              <div className="absolute bottom-6 left-5 flex flex-col gap-2.5 pointer-events-auto">
                <MapLegend />
                <ScaleBar />
              </div>

              {/* Bottom-right: locator inset */}
              <div className="absolute bottom-6 right-5 pointer-events-none hidden xl:block">
                <IndiaInset />
              </div>
            </>
        )}
      </div>
    </AppShell>
  );
}
