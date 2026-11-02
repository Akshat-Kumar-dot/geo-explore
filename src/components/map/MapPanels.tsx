import { useMapStore, useVisibleZones } from '../../stores/mapStore';
import { Toggle, Slider, SectionLabel } from '../ui/primitives';
import { num } from '../../lib/format';
import type { LayerVisibility } from '../../stores/mapStore';

const LAYER_LABELS: Record<keyof LayerVisibility, string> = {
  zones: 'Mine polygons (scored)',
  mines: 'GEM iron ore mines',
  occurrences: 'Mines without mapped footprint',
  constraints: 'Land-use constraints (indicative)',
  labels: 'Map labels',
};

export function LayersPanel() {
  const layers = useMapStore((s) => s.layers);
  const toggle = useMapStore((s) => s.toggleLayer);
  const filters = useMapStore((s) => s.filters);
  const setFilters = useMapStore((s) => s.setFilters);
  const visible = useVisibleZones();
  const total = useMapStore((s) => s.zones.length);

  return (
    <div className="w-[276px] rounded-xl bg-white border border-lineStrong shadow-float p-4 flex flex-col gap-4">
      <div>
        <SectionLabel className="mb-2.5">Layers</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {(Object.keys(LAYER_LABELS) as Array<keyof LayerVisibility>).map((k) => (
            <Toggle key={k} checked={layers[k]} onChange={() => toggle(k)} label={LAYER_LABELS[k]} />
          ))}
        </div>
      </div>

      <div className="border-t border-lineSoft pt-3.5">
        <SectionLabel className="mb-3">Filters</SectionLabel>
        <div className="flex flex-col gap-3.5">
          <div>
            <div className="text-[12px] text-body mb-1.5">Minimum model score</div>
            <Slider
              value={filters.minScore} min={0.55} max={0.95} step={0.01}
              onChange={(minScore) => setFilters({ minScore })}
              format={(v) => v.toFixed(2)}
            />
          </div>
          <div>
            <div className="text-[12px] text-body mb-1.5">Within distance of a road</div>
            <Slider
              value={filters.maxRoadKm} min={1} max={25} step={1}
              onChange={(maxRoadKm) => setFilters({ maxRoadKm })}
              format={(v) => (v >= 25 ? 'any' : `${v} km`)}
            />
          </div>
          <Toggle
            checked={filters.excludeConstrained}
            onChange={(excludeConstrained) => setFilters({ excludeConstrained })}
            label="Exclude land-use constrained zones"
          />
        </div>
      </div>

      <div className="border-t border-lineSoft pt-3 flex items-center justify-between text-[11.5px]">
        <span className="text-muted num">{num(visible.length)} of {num(total)} zones shown</span>
        <button
          className="text-accent hover:underline"
          onClick={() => setFilters({ minScore: 0.55, excludeConstrained: false, maxRoadKm: 25 })}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export function BasemapPanel() {
  const basemap = useMapStore((s) => s.basemap);
  const set = useMapStore((s) => s.setBasemap);
  const options = [
    { id: 'imagery' as const, name: 'Satellite imagery', note: 'Esri World Imagery' },
    { id: 'terrain' as const, name: 'Terrain base', note: 'Esri World Terrain' },
  ];
  return (
    <div className="w-[232px] rounded-xl bg-white border border-lineStrong shadow-float p-3 flex flex-col gap-1.5">
      <SectionLabel className="px-1 pb-1">Basemap</SectionLabel>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => set(o.id)}
          className={`text-left px-2.5 py-2 rounded-lg transition-colors ${
            basemap === o.id ? 'bg-surfaceAlt ring-1 ring-[#c6d3e2]' : 'hover:bg-surfaceAlt'
          }`}
        >
          <div className="text-[13px] text-ink">{o.name}</div>
          <div className="text-[11px] text-muted">{o.note}</div>
        </button>
      ))}
      <p className="px-1 pt-1.5 text-[10.5px] text-muted leading-snug">
        Tiles are desaturated and darkened in the browser so the data layers read on top.
      </p>
    </div>
  );
}
