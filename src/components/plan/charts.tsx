import {
  ResponsiveContainer, ComposedChart, Line, Area, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, BarChart, ReferenceLine, Cell,
} from 'recharts';
import type { ProductionRecord, Forecast } from '../../types';
import { num, shortDate, monthDate, humanFeature } from '../../lib/format';
import { fmt } from '../../lib/chartFmt';
import { CONFIDENCE_COLORS } from '../../lib/colors';

const AXIS = { stroke: '#8a99ad', fontSize: 11 };
const GRID = '#e8edf3';
const TIP = { fontSize: 12, borderRadius: 8, border: '1px solid #dce5ee' } as const;

/**
 * Actual vs planned, with the P10–P90 forecast band extending past the last
 * observation, and rainfall on a shared time axis underneath.
 */
export function ProductionForecastChart({
  history, forecast,
}: { history: ProductionRecord[]; forecast: Forecast | null }) {
  // Weekly means keep three years legible without hiding the monsoon signal.
  const weekly = new Map<string, { planned: number; actual: number; rain: number; n: number }>();
  for (const r of history) {
    const d = new Date(r.date);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const k = d.toISOString().slice(0, 10);
    const cur = weekly.get(k) ?? { planned: 0, actual: 0, rain: 0, n: 0 };
    cur.planned += r.planned_tonnes; cur.actual += r.actual_tonnes; cur.rain += r.rainfall_mm; cur.n++;
    weekly.set(k, cur);
  }
  const past = [...weekly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
    date,
    planned: Math.round(v.planned / v.n),
    actual: Math.round(v.actual / v.n),
    rain: +(v.rain / v.n).toFixed(1),
  }));

  const future = (forecast?.points ?? []).filter((_, i) => i % 3 === 0).map((p) => ({
    date: p.date,
    planned: p.planned,
    p50: p.p50,
    band: [p.p10, p.p90] as [number, number],
  }));

  // Stitch the band onto the last observed point so the line does not break.
  const joinPoint = past.length && future.length
    ? [{ date: past[past.length - 1].date, planned: past[past.length - 1].planned,
         p50: past[past.length - 1].actual,
         band: [past[past.length - 1].actual, past[past.length - 1].actual] as [number, number] }]
    : [];

  const data = [...past, ...joinPoint.slice(0, 0), ...future];
  if (past.length && future.length) {
    const idx = past.length - 1;
    (data[idx] as Record<string, unknown>).p50 = past[idx].actual;
    (data[idx] as Record<string, unknown>).band = [past[idx].actual, past[idx].actual];
  }
  const forecastStart = past.length ? past[past.length - 1].date : undefined;

  return (
    <div className="h-[268px]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -14 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
            tickFormatter={monthDate} minTickGap={44} />
          <YAxis yAxisId="t" tick={AXIS} tickLine={false} axisLine={false}
            tickFormatter={(v: number) => num(v)} />
          <YAxis yAxisId="r" orientation="right" tick={AXIS} tickLine={false} axisLine={false}
            domain={[0, 'dataMax']} width={34} tickFormatter={(v: number) => `${v}`} reversed={false} />
          <Tooltip
            contentStyle={TIP}
            labelFormatter={(l) => shortDate(String(l))}
            formatter={fmt<number | [number, number]>((v, n) => {
              if (n === 'band' && Array.isArray(v)) return [`${num(v[0])} – ${num(v[1])} t/d`, 'P10–P90 band'];
              const label = n === 'actual' ? 'Actual' : n === 'planned' ? 'Planned'
                : n === 'p50' ? 'Forecast P50' : 'Rainfall';
              return [n === 'rain' ? `${v} mm/d` : `${num(v as number)} t/d`, label];
            })}
          />
          <Legend verticalAlign="top" height={26} iconType="plainline" iconSize={14}
            wrapperStyle={{ fontSize: 11.5, color: '#536078' }}
            formatter={(v) => ({ actual: 'Actual', planned: 'Planned', p50: 'Forecast P50', band: 'P10–P90', rain: 'Rainfall (mm/d)' } as Record<string, string>)[String(v)] ?? String(v)} />

          <Bar yAxisId="r" dataKey="rain" fill="#c3dcea" maxBarSize={4} isAnimationActive={false} />
          <Area yAxisId="t" dataKey="band" stroke="none" fill="#3f9bc1" fillOpacity={0.18} isAnimationActive={false} />
          <Line yAxisId="t" type="monotone" dataKey="planned" stroke="#8a99ad" strokeWidth={1.4}
            strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line yAxisId="t" type="monotone" dataKey="actual" stroke="#2f8d79" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          <Line yAxisId="t" type="monotone" dataKey="p50" stroke="#2474d7" strokeWidth={2} dot={false} isAnimationActive={false} />
          {forecastStart && (
            <ReferenceLine yAxisId="t" x={forecastStart} stroke="#b6c2d1" strokeDasharray="3 3"
              label={{ value: 'forecast →', fontSize: 10, fill: '#7d8ea3', position: 'insideTopRight' }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rainfall against achievement, so the weather–production link is unmissable. */
export function RainfallLinkChart({ history }: { history: ProductionRecord[] }) {
  const buckets = new Map<string, { rain: number; ratio: number; n: number }>();
  for (const r of history) {
    const k = r.date.slice(0, 7);
    const cur = buckets.get(k) ?? { rain: 0, ratio: 0, n: 0 };
    cur.rain += r.rainfall_mm;
    cur.ratio += r.actual_tonnes / Math.max(1, r.planned_tonnes);
    cur.n++;
    buckets.set(k, cur);
  }
  const data = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-24).map(([k, v]) => ({
    date: `${k}-01`,
    rain: Math.round(v.rain),
    achievement: +((v.ratio / v.n) * 100).toFixed(1),
  }));

  return (
    <div className="h-[214px]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
            tickFormatter={monthDate} minTickGap={30} />
          <YAxis yAxisId="r" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis yAxisId="a" orientation="right" domain={[40, 110]} tick={AXIS} tickLine={false} axisLine={false} unit="%" width={40} />
          <Tooltip contentStyle={TIP} labelFormatter={(l) => monthDate(String(l))}
            formatter={fmt<number>((v, n) => n === 'rain' ? [`${num(v)} mm`, 'Monthly rainfall'] : [`${v}%`, 'Plan achievement'])} />
          <Bar yAxisId="r" dataKey="rain" fill="#9cc7de" radius={[2, 2, 0, 0]} maxBarSize={16} />
          <Line yAxisId="a" type="monotone" dataKey="achievement" stroke="#c4634f" strokeWidth={2} dot={false} />
          <ReferenceLine yAxisId="a" y={90} stroke="#d8b24a" strokeDasharray="4 3"
            label={{ value: 'shortfall threshold', fontSize: 9.5, fill: '#9a6a1c', position: 'insideBottomRight' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Equipment downtime by class, stacked per mine. */
export function DowntimeChart({ history, mineNames }: { history: ProductionRecord[]; mineNames: Record<string, string> }) {
  const acc = new Map<string, { crusher: number; loader: number; hoist: number; n: number }>();
  for (const r of history) {
    const cur = acc.get(r.mine_id) ?? { crusher: 0, loader: 0, hoist: 0, n: 0 };
    cur.crusher += r.downtime_hrs_crusher;
    cur.loader += r.downtime_hrs_loader;
    cur.hoist += r.downtime_hrs_hoist ?? 0;
    cur.n++;
    acc.set(r.mine_id, cur);
  }
  const data = [...acc.entries()].map(([id, v]) => ({
    mine: mineNames[id] ?? id,
    Crusher: +(v.crusher / v.n * 30).toFixed(1),
    Loader: +(v.loader / v.n * 30).toFixed(1),
    Hoist: +(v.hoist / v.n * 30).toFixed(1),
  })).sort((a, b) => (b.Crusher + b.Loader + b.Hoist) - (a.Crusher + a.Loader + a.Hoist));

  return (
    <div className="h-[236px]">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 4, bottom: 22, left: -16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="mine" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={{ stroke: GRID }}
            angle={-32} textAnchor="end" height={54} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false}
            label={{ value: 'hrs / 30 d', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#8a99ad', offset: 22 }} />
          <Tooltip contentStyle={TIP} formatter={fmt<number>((v, n) => [`${v} hrs`, n])} />
          <Legend verticalAlign="top" height={22} iconSize={9} wrapperStyle={{ fontSize: 11, color: '#536078' }} />
          <Bar dataKey="Crusher" stackId="d" fill="#3f9bc1" maxBarSize={30} />
          <Bar dataKey="Loader" stackId="d" fill="#53b7a4" maxBarSize={30} />
          <Bar dataKey="Hoist" stackId="d" fill="#c9a227" radius={[2, 2, 0, 0]} maxBarSize={30} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Signed driver influence on the forecast. */
export function RiskDriverBars({ drivers }: { drivers: Array<{ name: string; contribution: number }> }) {
  const max = Math.max(...drivers.map((d) => Math.abs(d.contribution)), 0.01);
  return (
    <div className="flex flex-col gap-2.5">
      {drivers.map((d) => {
        const w = (Math.abs(d.contribution) / max) * 50;
        const pos = d.contribution >= 0;
        return (
          <div key={d.name} className="grid grid-cols-[168px_1fr_46px] items-center gap-3">
            <div className="text-[12px] text-body truncate" title={humanFeature(d.name)}>{humanFeature(d.name)}</div>
            <div className="relative h-[14px]">
              <div className="absolute inset-y-0 left-1/2 w-px bg-[#c7d2df]" />
              <div className="absolute top-[2px] h-[10px] rounded-[2px]"
                style={{ left: pos ? '50%' : `${50 - w}%`, width: `${w}%`, background: pos ? '#2f8d79' : '#c4634f' }} />
            </div>
            <div className="num text-[11.5px] text-right" style={{ color: pos ? '#1f6b4a' : '#a4342b' }}>
              {d.contribution > 0 ? '+' : ''}{d.contribution.toFixed(2)}
            </div>
          </div>
        );
      })}
      <div className="mt-0.5 flex justify-between text-[9.5px] text-muted">
        <span>← increases shortfall risk</span><span>protects output →</span>
      </div>
    </div>
  );
}

export function ActionConfidencePill({ level }: { level: 'high' | 'medium' | 'low' }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.07em] px-1.5 py-0.5 rounded"
      style={{ color: CONFIDENCE_COLORS[level], background: `${CONFIDENCE_COLORS[level]}14` }}>
      {level}
    </span>
  );
}

export { Cell };
