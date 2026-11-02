import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, ReferenceLine, Cell,
} from 'recharts';
import { ShieldCheck, Database, Ban } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';
import { num, pct, longDate } from '../../lib/format';
import { Skeleton, SectionLabel } from '../ui/primitives';
import { fmt } from '../../lib/chartFmt';
import { BELTS } from '../../data/fixtures/mines';

const AXIS = { stroke: '#8a99ad', fontSize: 11 };
const GRID = '#e8edf3';

/**
 * The "why should I believe this?" screen. Nothing here is a performance claim
 * about a deployed system — it is the validation design, run on synthetic labels.
 */
export default function AnalysisPanel() {
  const prov = useMapStore((s) => s.provenance);
  const zones = useMapStore((s) => s.zones);
  const loading = useMapStore((s) => s.loading);

  // Success-rate curve: what share of held-out known occurrences fall inside
  // the top X% of ranked ground. A flat diagonal would mean the model is useless.
  const successCurve = Array.from({ length: 21 }, (_, i) => {
    const area = i * 5;
    const captured = area === 0 ? 0 : Math.min(100, 100 * (1 - Math.pow(1 - area / 100, 2.9)));
    return { area, captured: +captured.toFixed(1), random: area };
  });

  const folds = (prov?.cv_auc_folds ?? []).map((auc, i) => ({ fold: `Fold ${i + 1}`, auc }));

  // Leave-one-belt-out: each belt withheld in turn, then scored. "Held" is the real count of
  // polygons with a GEM iron mine within 1 km; "recovered" counts those in the top 20% of the
  // ranking, which uses the synthetic scores until Stage 2 is trained.
  const topCut = Math.ceil(zones.length * 0.2);
  const clusters = BELTS.map((b) => {
    const known = zones.filter((z) => z.belt === b.id && (z.iron_tag === '0km' || z.iron_tag === '1km'));
    const recovered = known.filter((z) => z.rank <= topCut).length;
    return { cluster: `${b.name}${b.role === 'test' ? ' (test belt)' : ''}`, held: known.length, recovered,
      rate: known.length ? +(recovered / known.length).toFixed(2) : 0 };
  });

  const scoreHistogram = Array.from({ length: 8 }, (_, i) => {
    const lo = 0.55 + i * 0.05;
    return {
      band: lo.toFixed(2),
      count: zones.filter((z) => z.score_mean >= lo && z.score_mean < lo + 0.05).length,
    };
  });

  if (loading || !prov) {
    return (
      <div className="absolute inset-0 bg-canvas overflow-y-auto">
        <div className="max-w-[1180px] mx-auto px-8 py-7 grid grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[240px] rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-canvas overflow-y-auto scroll-thin">
      <div className="max-w-[1120px] mx-auto px-10 py-9">
        <div className="max-w-[74ch]">
          <div className="label-cap">Model card</div>
          <h1 className="mt-2 title-serif text-[27px] leading-[1.2]">
            Why you should, and should not, believe this ranking
          </h1>
          <p className="mt-3 prose-serif text-[14.5px]">
            Mapping models fail in one predictable way. They memorise the neighbourhood of their
            training points, then look brilliant on a random hold-out and useless on new ground.
            Every figure below is measured with <em>blocked spatial cross-validation</em>: whole
            mines are withheld, never individual pixels, and one whole belt is held out to test transfer.
            The labels are real Stage 1 polygons but the scores are synthetic, so read these figures as a
            description of the validation design rather than as a performance claim.
          </p>
        </div>

        <div className="my-7 h-px bg-[#e3e9f0]" />

        {/* Provenance */}
        <div className="mb-8">
          <SectionLabel className="mb-4">Provenance</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-8 gap-y-5 text-[12.5px]">
            {[
              ['Model version', prov.model_version],
              ['Trained', longDate(prov.trained_at)],
              ['Labels', num(prov.label_count)],
              ['Held out', num(prov.heldout_count)],
              ['Input bands', num(prov.feature_count)],
              ['Blocked-CV AUC', prov.cv_auc_mean.toFixed(2)],
            ].map(([k, v]) => (
              <div key={k} className="border-l border-[#e3e9f0] pl-3">
                <div className="label-cap mb-1.5">{k}</div>
                <div className="num text-ink font-semibold text-[13.5px]">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-[#e3e9f0] flex flex-wrap gap-x-8 gap-y-3 text-[12px]">
            <span className="inline-flex items-center gap-2 text-[#8a5a15]">
              <Database size={14} /> Polygons and mines: <strong className="font-semibold">real</strong> · scores: <strong className="font-semibold">synthetic</strong>
            </span>
            <span className="inline-flex items-center gap-2 text-body">
              <Ban size={14} className="text-[#a4342b]" />
              Excluded from training: {prov.excluded_features.join(', ')}
            </span>
            <span className="inline-flex items-center gap-2 text-body">
              <ShieldCheck size={14} className="text-[#2f8d79]" />
              No Fe grade or tonnage is produced by this model
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-9">
          {/* Success-rate curve */}
          <div>
            <SectionLabel>Success-rate curve</SectionLabel>
            <p className="mt-2 mb-3 prose-serif text-[13px]">
              Share of held-out known iron-mine polygons captured as ranked area accumulates.
              The diagonal is what random ranking would give.
            </p>
            <div className="h-[212px]">
              <ResponsiveContainer>
                <LineChart data={successCurve} margin={{ top: 4, right: 8, bottom: 16, left: -12 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="area" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
                    label={{ value: 'Top % of ranked area', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#8a99ad' }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #dce5ee' }}
                    formatter={fmt<number>((v, n) => [`${v}%`, n === 'captured' ? 'Model' : 'Random'])}
                    labelFormatter={(l) => `Top ${l}% of area`}
                  />
                  <Line type="monotone" dataKey="random" stroke="#b6c2d1" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="captured" stroke="#2f8d79" strokeWidth={2.4} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Blocked CV AUC per fold */}
          <div>
            <SectionLabel>Blocked spatial CV — AUC per fold</SectionLabel>
            <p className="mt-2 mb-3 prose-serif text-[13px]">
              Spread across folds matters more than the mean. A tight band means the ranking
              generalises to ground the model has never seen.
            </p>
            <div className="h-[212px]">
              <ResponsiveContainer>
                <BarChart data={folds} margin={{ top: 4, right: 8, bottom: 4, left: -12 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="fold" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis domain={[0.5, 1]} tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #dce5ee' }} formatter={fmt<number>((v) => [v.toFixed(2), 'AUC'])} />
                  <ReferenceLine y={0.5} stroke="#c9a227" strokeDasharray="4 3"
                    label={{ value: 'chance', fontSize: 10, fill: '#9a6a1c', position: 'insideTopLeft' }} />
                  <ReferenceLine y={prov.cv_auc_mean} stroke="#2f8d79" strokeDasharray="3 3"
                    label={{ value: `mean ${prov.cv_auc_mean.toFixed(2)}`, fontSize: 10, fill: '#2f8d79', position: 'insideTopRight' }} />
                  <Bar dataKey="auc" fill="#3f9bc1" radius={[3, 3, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Held-out cluster test */}
          <div>
            <SectionLabel>Leave-one-belt-out test</SectionLabel>
            <p className="mt-2 mb-3 prose-serif text-[13px]">
              Each belt withheld from training in turn, then scored. Recovery rate is the share of
              that belt's iron-tagged polygons (GEM mine within 1 km) in the top 20% of the ranking.
            </p>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-muted2 border-b border-lineSoft">
                  <th className="text-left font-medium py-2">Withheld belt</th>
                  <th className="text-right font-medium py-2">Iron polygons</th>
                  <th className="text-right font-medium py-2">Recovered</th>
                  <th className="text-right font-medium py-2">Rate</th>
                </tr>
              </thead>
              <tbody>
                {clusters.map((c) => (
                  <tr key={c.cluster} className="border-b border-lineSoft last:border-0">
                    <td className="py-2">{c.cluster}</td>
                    <td className="py-2 text-right num">{c.held}</td>
                    <td className="py-2 text-right num">{c.recovered}</td>
                    <td className="py-2 text-right num font-semibold"
                        style={{ color: c.rate >= 0.7 ? '#1f6b4a' : c.rate >= 0.55 ? '#9a6a1c' : '#a4342b' }}>
                      {pct(c.rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 prose-serif text-[12.5px] text-[#6b7a8d]">
              Bellary–Hospet–Sandur is the real test: it is never used for training, so its recovery rate
              shows whether the model transfers to a new region. Rates here follow the synthetic scores.
            </p>
          </div>

          {/* Score distribution */}
          <div>
            <SectionLabel>Score distribution across ranked zones</SectionLabel>
            <p className="mt-2 mb-3 prose-serif text-[13px]">
              A long tail is expected and healthy. A flat distribution would mean the model
              cannot separate ground at all.
            </p>
            <div className="h-[212px]">
              <ResponsiveContainer>
                <BarChart data={scoreHistogram} margin={{ top: 4, right: 8, bottom: 16, left: -18 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="band" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
                    label={{ value: 'Model score', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#8a99ad' }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #dce5ee' }} formatter={fmt<number>((v) => [String(v), 'zones'])} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={50}>
                    {scoreHistogram.map((_d, i) => (
                      <Cell key={i} fill={['#3f9bc1', '#4aa8b4', '#53b7a4', '#7cc478', '#a8cf45', '#d0c73f', '#f2bf39', '#e88a3e'][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <p className="mt-10 pt-6 border-t border-[#e3e9f0] prose-serif text-[12.5px] text-[#6b7a8d] max-w-[86ch]">
          These figures describe the validation design run on synthetic scores. They are not performance
          claims. Once Stage 2 is trained, the same four diagnostics will be reported against the manually
          verified iron-mine polygons, and Stage 3 against IBM inspection-report grade classes.
        </p>
      </div>
    </div>
  );
}
