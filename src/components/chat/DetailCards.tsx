import { TriangleAlert, ArrowUpRight } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';
import { usePlanStore } from '../../stores/planStore';
import { scoreColor, favourabilityBand, riskColor } from '../../lib/colors';
import { num, kmDist, humanFeature, LAND_USE_LABEL, IRON_TAG_LABEL } from '../../lib/format';
import { BELT_NAME } from '../../data/fixtures/mines';

/* Compact, light-theme cards rendered inline under an assistant reply.
   These replace the large dark panel that used to sit over the map. */

function DriverBars({ drivers }: { drivers: Array<{ name: string; contribution: number }> }) {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 6);
  const max = Math.max(...sorted.map((d) => Math.abs(d.contribution)), 0.01);
  return (
    <div className="flex flex-col gap-[5px]">
      {sorted.map((d) => {
        const w = (Math.abs(d.contribution) / max) * 50;
        const pos = d.contribution >= 0;
        return (
          <div key={d.name} className="grid grid-cols-[1fr_86px] items-center gap-2">
            <span className="text-[11px] text-[#54637a] truncate" title={humanFeature(d.name)}>
              {humanFeature(d.name)}
            </span>
            <div className="relative h-[11px]">
              <div className="absolute inset-y-0 left-1/2 w-px bg-[#dbe3ec]" />
              <div
                className="absolute top-[1px] h-[9px] rounded-[2px]"
                style={{ left: pos ? '50%' : `${50 - w}%`, width: `${w}%`, background: pos ? '#2f8d79' : '#c4634f' }}
              />
            </div>
          </div>
        );
      })}
      <div className="flex justify-between text-[9px] text-[#93a0b1] pt-0.5">
        <span>← lowers</span><span>raises →</span>
      </div>
    </div>
  );
}

export function ZoneDetailCard({ zoneId }: { zoneId: string }) {
  const zone = useMapStore((s) => s.zones.find((z) => z.zone_id === zoneId) ?? null);
  const setCentreView = useMapStore((s) => s.setCentreView);
  if (!zone) return null;

  return (
    <div className="mt-3 rounded-lg border border-[#e2e8f0] bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#eef2f7] bg-[#fbfcfe]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: scoreColor(zone.score_mean) }} />
          <span className="text-[12.5px] font-semibold text-ink num">{zone.zone_id}</span>
          {zone.land_use_flag !== 'clear' && <TriangleAlert size={12} className="text-[#c08a2e]" />}
        </div>
        <span className="text-[10.5px] text-muted num">{BELT_NAME[zone.belt]} · Rank {zone.rank} · {favourabilityBand(zone.score_mean)}</span>
      </div>

      <div className="px-3 py-2.5 grid grid-cols-4 gap-2 border-b border-[#eef2f7]">
        {[
          ['Model score', zone.score_mean.toFixed(2)],
          ['Area', `${num(zone.area_ha)} ha`],
          ['Iron tag', IRON_TAG_LABEL[zone.iron_tag]],
          ['To road', kmDist(zone.dist_to_road_km)],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-[9px] uppercase tracking-[0.07em] text-[#93a0b1] leading-tight">{k}</div>
            <div className="mt-0.5 text-[12.5px] font-semibold text-ink num">{v}</div>
          </div>
        ))}
      </div>

      <div className="px-3 py-2.5">
        <div className="text-[9px] uppercase tracking-[0.09em] text-[#93a0b1] mb-2">Score drivers (SHAP, synthetic)</div>
        <DriverBars drivers={zone.top_features} />
      </div>

      <div className="px-3 py-2 border-t border-[#eef2f7] flex items-center justify-between text-[10.5px]">
        <span className="text-muted">
          {LAND_USE_LABEL[zone.land_use_flag]} · {zone.nearest_mine} {kmDist(zone.dist_to_mine_km)}
          <span className="text-[#a3aebc]"> (context only)</span>
        </span>
        <button
          onClick={() => setCentreView('analysis')}
          className="inline-flex items-center gap-1 text-accent hover:underline shrink-0"
        >
          Validation <ArrowUpRight size={10} />
        </button>
      </div>
    </div>
  );
}

export function MineDetailCard({ mineId }: { mineId: string }) {
  const mine = useMapStore((s) => s.mines.find((m) => m.mine_id === mineId) ?? null);
  const records = usePlanStore((s) => s.records);
  const forecast = usePlanStore((s) => s.forecast);
  if (!mine) return null;

  const rows = records.filter((r) => r.mine_id === mineId);
  const mean = (f: (r: typeof rows[number]) => number) =>
    rows.length ? rows.reduce((a, r) => a + f(r), 0) / rows.length : 0;
  const ach = (monsoon: boolean) => {
    const set = rows.filter((r) => r.is_monsoon === monsoon);
    return set.length ? set.reduce((a, r) => a + r.actual_tonnes / Math.max(1, r.planned_tonnes), 0) / set.length : 0;
  };
  const p = forecast?.mine_id === mineId ? forecast.shortfall_probability : null;
  const c = p != null ? riskColor(p) : null;

  return (
    <div className="mt-3 rounded-lg border border-[#e2e8f0] bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#eef2f7] bg-[#fbfcfe]">
        <span className="text-[12.5px] font-semibold text-ink">{mine.name}</span>
        <span className="text-[10.5px] text-muted">
          {mine.mine_type === 'OC' ? 'Opencast' : 'Underground'} · {mine.district} · {BELT_NAME[mine.belt]}
        </span>
      </div>

      {rows.length > 0 && (
        <div className="px-3 py-2.5 grid grid-cols-4 gap-2 border-b border-[#eef2f7]">
          {[
            ['Capacity', `${num(mine.nominal_capacity_tpd)} tpd`],
            ['Dry', ach(false).toFixed(2)],
            ['Monsoon', ach(true).toFixed(2)],
            ['Equip.', `${mean((r) => r.equipment_available_pct).toFixed(0)}%`],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[9px] uppercase tracking-[0.07em] text-[#93a0b1] leading-tight">{k}</div>
              <div className="mt-0.5 text-[12.5px] font-semibold text-ink num">{v}</div>
            </div>
          ))}
        </div>
      )}

      {forecast && forecast.mine_id === mineId && (
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] uppercase tracking-[0.09em] text-[#93a0b1]">Forecast drivers (30 d)</span>
            {p != null && c && (
              <span className="num text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ color: c.fg, background: c.bg }}>
                P(shortfall) {p.toFixed(2)}
              </span>
            )}
          </div>
          <DriverBars drivers={forecast.drivers} />
        </div>
      )}

      <div className="px-3 py-2 border-t border-[#eef2f7] text-[10px] text-[#a3aebc]">
        Real mine, synthetic production data · shortfall probability is a model output, not a confidence interval
      </div>
    </div>
  );
}
