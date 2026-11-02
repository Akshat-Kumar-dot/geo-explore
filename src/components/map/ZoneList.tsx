import { useState } from 'react';
import { ArrowUpDown, TriangleAlert, Download } from 'lucide-react';
import { useMapStore, useVisibleZones } from '../../stores/mapStore';
import { scoreColor, favourabilityBand } from '../../lib/colors';
import { num, kmDist, LAND_USE_LABEL, IRON_TAG_LABEL } from '../../lib/format';
import { BELT_NAME } from '../../data/fixtures/mines';
import { exportZonesCsv } from '../../lib/exportCsv';
import { explainZoneInChat } from '../../lib/explainZone';
import { Skeleton, EmptyState } from '../ui/primitives';

type Col = 'rank' | 'belt' | 'score_mean' | 'area_ha' | 'iron_tag' | 'land_use_flag' | 'dist_to_mine_km';

const COLS: Array<{ key: Col; label: string; align?: 'right'; hint?: string }> = [
  { key: 'rank', label: 'Rank' },
  { key: 'belt', label: 'Belt' },
  { key: 'score_mean', label: 'Model score', align: 'right', hint: 'Synthetic until Stage 2 is trained' },
  { key: 'area_ha', label: 'Area (ha)', align: 'right' },
  { key: 'iron_tag', label: 'Iron tag', hint: 'Distance from the polygon to the nearest GEM iron-mine point' },
  { key: 'land_use_flag', label: 'Land use', hint: 'Synthetic' },
  { key: 'dist_to_mine_km', label: 'Nearest GEM mine', hint: 'Context only — excluded from the model' },
];

/** Exploration managers work from lists. Sortable, exportable, same data as the map. */
export default function ZoneList() {
  const zones = useVisibleZones();
  const loading = useMapStore((s) => s.loading);
  const selected = useMapStore((s) => s.selectedZoneId);
  const select = useMapStore((s) => s.selectZone);
  const [sort, setSort] = useState<{ key: Col; dir: 1 | -1 }>({ key: 'rank', dir: 1 });

  const rows = [...zones].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y)) * sort.dir;
    return ((x as number) - (y as number)) * sort.dir;
  });

  const toggle = (key: Col) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'rank' ? 1 : -1 }));

  return (
    <div className="absolute inset-0 bg-canvas overflow-y-auto scroll-thin">
      <div className="max-w-[1100px] mx-auto px-8 py-7">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h1 className="text-[20px] font-bold text-ink">Ranked iron-ore targets</h1>
            <p className="mt-1 text-[12.5px] text-muted">
              {loading ? 'Loading…' : `${num(rows.length)} mapped mining polygons · ordered by model score, a probability of exposed iron ore. No Fe grade or tonnage is implied.`}
            </p>
          </div>
          <button className="btn" onClick={() => exportZonesCsv(rows)} disabled={!rows.length}>
            <Download size={15} strokeWidth={1.7} /> Export CSV
          </button>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-lineSoft bg-[#fbfcfe]">
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    title={c.hint}
                    onClick={() => toggle(c.key)}
                    className={`px-4 py-2.5 font-medium text-muted2 cursor-pointer select-none hover:text-ink transition-colors ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      <ArrowUpDown size={11} className={sort.key === c.key ? 'opacity-100' : 'opacity-25'} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-lineSoft">
                  {Array.from({ length: COLS.length }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-3.5" /></td>
                  ))}
                </tr>
              ))}
              {!loading && rows.map((z) => (
                <tr
                  key={z.zone_id}
                  onClick={() => { select(z.zone_id, 'list'); useMapStore.getState().setCentreView('map'); }}
                  onDoubleClick={() => explainZoneInChat(z.zone_id)}
                  className={`border-b border-lineSoft cursor-pointer transition-colors ${
                    selected === z.zone_id ? 'bg-[#eef4fb]' : 'hover:bg-[#f6f9fc]'
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <span className="num font-semibold text-ink">{z.rank}</span>
                    <span className="ml-2 num text-muted">{z.zone_id}</span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{BELT_NAME[z.belt]}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center gap-2 justify-end">
                      <span className="w-2 h-2 rounded-full" style={{ background: scoreColor(z.score_mean) }} />
                      <span className="num font-semibold">{z.score_mean.toFixed(2)}</span>
                      <span className="text-muted w-[68px] text-left">{favourabilityBand(z.score_mean)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right num">{num(z.area_ha)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{IRON_TAG_LABEL[z.iron_tag]}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      {z.land_use_flag !== 'clear' && <TriangleAlert size={12} className="text-[#c08a2e]" />}
                      {LAND_USE_LABEL[z.land_use_flag]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted max-w-[260px] truncate" title={z.nearest_mine}>
                    {z.nearest_mine} <span className="num">· {kmDist(z.dist_to_mine_km)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length && (
            <EmptyState
              title="No zones match the current filters"
              body="Lower the minimum model score, widen the road-distance limit, or turn off the land-use exclusion in the Layers panel."
            />
          )}
        </div>

        <p className="mt-4 text-[11px] text-muted leading-relaxed max-w-[80ch]">
          Polygons, areas, belts, iron tags and nearest mines are real (Maus et al. 2022; Global Energy Monitor,
          Global Iron Ore Mines Tracker). Model scores and land use are synthetic until the Stage 2 detector is
          trained. Distance to a mine is context only and is excluded from the model's features.
        </p>
      </div>
    </div>
  );
}
