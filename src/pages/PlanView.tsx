import { useEffect, useMemo, useState } from 'react';
import {
  Mountain, CalendarRange, TrendingDown, Package, Download,
  CheckCircle2, CircleDot, Circle, Sparkles, Info,
} from 'lucide-react';
import AppShell from '../components/shell/AppShell';
import UploadPanel from '../components/plan/UploadPanel';
import {
  ProductionForecastChart, RainfallLinkChart, DowntimeChart,
  RiskDriverBars, ActionConfidencePill,
} from '../components/plan/charts';
import { usePlanStore } from '../stores/planStore';
import { adapter } from '../data/adapters';
import { Skeleton, SectionLabel, ScoreGauge, Slider, EmptyState } from '../components/ui/primitives';
import { num, tonnes, longDate } from '../lib/format';
import { riskColor } from '../lib/colors';
import { exportRowsCsv } from '../lib/exportCsv';
import type { ProductionRecord, Forecast } from '../types';
import { BELT_NAME } from '../data/fixtures/mines';

const STEP_TONE = ['#2e79d1', '#2f8d79', '#b79a4f', '#6652ad', '#ad4838', '#738196'];

export default function PlanView() {
  const {
    records, mines, summary, status, plan, planOrigin,
    selectedMineId, forecast, scenario, forecasting,
    loadSample, selectMine, setScenario,
  } = usePlanStore();

  // Per-mine 30-day shortfall probability for the risk table.
  const risks = useMineRisks(records, mines.map((m) => m.mine_id));

  const mineNames = useMemo(
    () => Object.fromEntries(mines.map((m) => [m.mine_id, m.name])),
    [mines],
  );
  const mineHistory = useMemo(
    () => records.filter((r) => r.mine_id === selectedMineId),
    [records, selectedMineId],
  );

  const metrics = useMemo(() => {
    if (!records.length) return null;
    const dates = [...new Set(records.map((r) => r.date))];
    const avgRisk = risks.length ? risks.reduce((a, r) => a + r.p, 0) / risks.length : null;
    return {
      mines: new Set(records.map((r) => r.mine_id)).size,
      days: dates.length,
      risk: plan?.projected_shortfall.probability ?? avgRisk,
      planned: records.reduce((a, r) => a + r.planned_tonnes, 0),
    };
  }, [records, risks, plan]);

  const empty = !summary;

  return (
    <AppShell screen="plan">
      <div className="absolute inset-0 overflow-y-auto scroll-thin">
          <div className="px-7 py-6 max-w-[1600px]">
            {/* Page header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h1 className="text-[28px] font-bold text-ink2 leading-tight">Iron ore production plan</h1>
                <p className="mt-1.5 text-[17px] text-body">
                  Ten opencast mines — Singhbhum–Keonjhar (OD, JH), Bailadila (CG), Sandur (KA)
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                {!empty && (
                  <button
                    className="btn !h-[42px] !px-4"
                    onClick={() => exportRowsCsv(
                      `geoexplore-mine-risk-${new Date().toISOString().slice(0, 10)}.csv`,
                      risks.map((r) => ({
                        mine_id: r.mine_id, mine: mineNames[r.mine_id] ?? r.mine_id,
                        shortfall_probability_30d: r.p,
                        expected_gap_tonnes_30d: r.gap, data_source: 'synthetic',
                      })),
                      'SYNTHETIC DEMONSTRATION DATA. Shortfall probability is a model output, not a confidence interval.',
                    )}
                  >
                    <Download size={16} strokeWidth={1.7} /> Export plan
                  </button>
                )}
                {empty && (
                  <button className="btn-dark !h-[42px] !px-4" onClick={() => void loadSample()}>
                    <Sparkles size={16} strokeWidth={1.7} /> Load sample data
                  </button>
                )}
              </div>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
              <MetricCard icon={Mountain} tint="#2e8c75" label="Mines monitored"
                value={metrics ? num(metrics.mines) : '—'} note="Opencast iron ore mines" loading={status === 'validating'} />
              <MetricCard icon={CalendarRange} tint="#149bc7" label="Days analysed"
                value={metrics ? num(metrics.days) : '—'}
                note={summary ? `${longDate(summary.from)} → ${longDate(summary.to)}` : 'No data loaded'} loading={status === 'validating'} />
              <MetricCard icon={TrendingDown} tint="#ad4838" label="Shortfall risk (30 d)"
                value={metrics?.risk != null ? metrics.risk.toFixed(2) : '—'}
                note="Model probability — not a confidence interval" loading={status === 'validating'} />
              <MetricCard icon={Package} tint="#2875d4" label="Total planned tonnes"
                value={metrics ? num(metrics.planned) : '—'} note="From the production plan on file" loading={status === 'validating'} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
              {/* ---------------- LEFT: steps + charts ---------------- */}
              <div className="flex flex-col gap-5 min-w-0">
                {/* Plan steps */}
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-1">
                    <SectionLabel>Corrective plan</SectionLabel>
                    {planOrigin && (
                      <span className="text-[10.5px] text-muted inline-flex items-center gap-1.5">
                        <Info size={11} />
                        {planOrigin === 'llm' ? 'Generated by the language model from your data' : 'Standard plan — language model unavailable'}
                      </span>
                    )}
                  </div>

                  {!plan && (
                    <EmptyState
                      title={empty ? 'No production data loaded' : 'Ready to generate'}
                      body={empty
                        ? 'Load the sample dataset or drop a daily production CSV in the panel on the right. The plan is built from the data you supply.'
                        : 'Press “Generate production plan” to build a corrective plan, risk drivers and ranked actions from the loaded records.'}
                    />
                  )}

                  {plan && (
                    <div className="relative mt-4 pl-[52px]">
                      <div className="absolute left-[19px] top-3 bottom-3 w-[2px] bg-[#cbd6e2]" />
                      {plan.plan_steps.map((s, i) => (
                        <div key={s.step} className="relative pb-6 last:pb-0">
                          <div className="absolute -left-[52px] top-0 w-[38px] h-[38px] rounded-full grid place-items-center text-white text-[15px] font-semibold"
                            style={{ background: STEP_TONE[i % STEP_TONE.length] }}>
                            {s.step}
                          </div>
                          <div className="flex items-start justify-between gap-4">
                            <h3 className="text-[15px] font-bold text-ink2 leading-snug">{s.title}</h3>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[13px] text-[#344a68] num whitespace-nowrap">{s.timeline}</span>
                              <StatusChip status={s.status} />
                            </div>
                          </div>
                          <ul className="mt-2 flex flex-col gap-1.5">
                            {s.activities.map((a, j) => (
                              <li key={j} className="flex gap-2.5 text-[13.5px] text-body leading-snug">
                                <span className="mt-[7px] w-[3px] h-[3px] rounded-full bg-ink2 shrink-0" />
                                {a}
                              </li>
                            ))}
                          </ul>
                          {i < plan.plan_steps.length - 1 && <div className="mt-5 h-px bg-lineSoft" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Forecast chart */}
                {!empty && (
                  <div className="card p-5">
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <SectionLabel>Actual vs planned production</SectionLabel>
                        <p className="mt-1 text-[12px] text-muted">
                          Weekly means with the 30-day P10–P90 forecast band. Rainfall in pale blue on the right axis.
                        </p>
                      </div>
                      <select
                        value={selectedMineId}
                        onChange={(e) => void selectMine(e.target.value)}
                        className="h-8 rounded-lg border border-[#ccd6e3] bg-white px-2.5 text-[12.5px] text-ink outline-none"
                      >
                        {mines.map((m) => (
                          <option key={m.mine_id} value={m.mine_id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <ProductionForecastChart history={mineHistory} forecast={forecast} />
                  </div>
                )}

                {/* Rainfall link + downtime */}
                {!empty && (
                  <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
                    <div className="card p-5">
                      <SectionLabel>Rainfall against plan achievement</SectionLabel>
                      <p className="mt-1 mb-2 text-[12px] text-muted">
                        {mineNames[selectedMineId]} — monthly rainfall and the share of plan achieved.
                      </p>
                      <RainfallLinkChart history={mineHistory} />
                    </div>
                    <div className="card p-5">
                      <SectionLabel>Equipment downtime by class</SectionLabel>
                      <p className="mt-1 mb-2 text-[12px] text-muted">
                        Mean hours per 30 days. Hoist applies to underground mines only.
                      </p>
                      <DowntimeChart history={records} mineNames={mineNames} />
                    </div>
                  </div>
                )}

                {/* Mine risk table */}
                {!empty && (
                  <div className="card p-5">
                    <SectionLabel>Mine risk ranking — next 30 days</SectionLabel>
                    <p className="mt-1 mb-3 text-[12px] text-muted">
                      Shortfall probability is a model output. It is not a confidence interval, and it says
                      nothing about ore grade.
                    </p>
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="text-muted2 border-b border-lineSoft">
                          <th className="text-left font-medium py-2">Mine</th>
                          <th className="text-left font-medium py-2">Location</th>
                          <th className="text-center font-medium py-2">Belt</th>
                          <th className="text-right font-medium py-2">Capacity (tpd)</th>
                          <th className="text-right font-medium py-2">Expected gap</th>
                          <th className="text-right font-medium py-2">Shortfall probability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {risks.length === 0 && Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} className="border-b border-lineSoft">
                            {Array.from({ length: 6 }).map((__, j) => (
                              <td key={j} className="py-2.5"><Skeleton className="h-3.5" /></td>
                            ))}
                          </tr>
                        ))}
                        {risks.map((r) => {
                          const m = mines.find((x) => x.mine_id === r.mine_id);
                          const c = riskColor(r.p);
                          return (
                            <tr key={r.mine_id}
                              onClick={() => void selectMine(r.mine_id)}
                              className={`border-b border-lineSoft last:border-0 cursor-pointer transition-colors ${
                                selectedMineId === r.mine_id ? 'bg-[#eef4fb]' : 'hover:bg-[#f6f9fc]'}`}>
                              <td className="py-2.5 font-medium text-ink">{m?.name ?? r.mine_id}</td>
                              <td className="py-2.5 text-body">{m?.district ?? '—'}</td>
                              <td className="py-2.5 text-center text-body">{m ? BELT_NAME[m.belt] : '—'}</td>
                              <td className="py-2.5 text-right num">{m ? num(m.nominal_capacity_tpd) : '—'}</td>
                              <td className="py-2.5 text-right num">{r.gap > 0 ? tonnes(r.gap) : '—'}</td>
                              <td className="py-2.5 text-right">
                                <span className="num font-semibold px-2 py-0.5 rounded"
                                  style={{ color: c.fg, background: c.bg }}>{r.p.toFixed(2)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ---------------- RIGHT: upload, gauge, drivers, actions ---------------- */}
              <div className="flex flex-col gap-5">
                <UploadPanel />

                {!empty && (
                  <div className="card p-5">
                    <SectionLabel>Projected shortfall</SectionLabel>
                    <div className="mt-3 flex items-center gap-5">
                      <div className="text-[#c4634f] shrink-0">
                        <ScoreGauge
                          value={plan?.projected_shortfall.probability ?? forecast?.shortfall_probability ?? 0}
                          size={92} caption="Probability"
                        />
                      </div>
                      <dl className="flex-1 text-[12.5px] leading-[1.9]">
                        <div className="flex justify-between">
                          <dt className="text-muted">Horizon</dt>
                          <dd className="num">{plan?.projected_shortfall.horizon_days ?? 30} days</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Expected gap</dt>
                          <dd className="num">{plan ? tonnes(plan.projected_shortfall.expected_gap_tonnes) : '—'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Mine in view</dt>
                          <dd>{mineNames[selectedMineId] ?? '—'}</dd>
                        </div>
                      </dl>
                    </div>
                    <p className="mt-3 pt-3 border-t border-lineSoft text-[11px] text-muted leading-relaxed">
                      A probability that output falls short of the plan — not a confidence interval, and not a
                      statement about grade or reserves. Synthetic demonstration data.
                    </p>
                  </div>
                )}

                {/* What-if */}
                {!empty && (
                  <div className="card p-5">
                    <div className="flex items-center justify-between">
                      <SectionLabel>Scenario</SectionLabel>
                      {forecasting && <span className="text-[10.5px] text-muted">re-forecasting…</span>}
                    </div>
                    <p className="mt-1 mb-3.5 text-[12px] text-muted">
                      Re-runs the forecast for {mineNames[selectedMineId] ?? 'the selected mine'} live.
                    </p>
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="text-[12px] text-body mb-1.5">Rainfall vs climatology</div>
                        <Slider value={scenario.rainfallScale} min={0} max={2} step={0.05}
                          onChange={(rainfallScale) => void setScenario({ rainfallScale })}
                          format={(v) => `${(v * 100).toFixed(0)}%`} />
                      </div>
                      <div>
                        <div className="text-[12px] text-body mb-1.5">Equipment availability</div>
                        <Slider value={scenario.equipmentPct} min={50} max={100} step={1}
                          onChange={(equipmentPct) => void setScenario({ equipmentPct })}
                          format={(v) => `${v}%`} />
                      </div>
                    </div>
                    {forecast && (
                      <div className="mt-4 pt-3.5 border-t border-lineSoft flex items-center justify-between text-[12.5px]">
                        <span className="text-muted">Shortfall probability under this scenario</span>
                        <span className="num font-semibold px-2 py-0.5 rounded"
                          style={riskColor(forecast.shortfall_probability) as never}>
                          {forecast.shortfall_probability.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <button className="mt-3 text-[11.5px] text-accent hover:underline"
                      onClick={() => void setScenario({ rainfallScale: 1, equipmentPct: 88 })}>
                      Reset to climatology
                    </button>
                  </div>
                )}

                {/* Risk drivers */}
                {!empty && (
                  <div className="card p-5">
                    <SectionLabel>Risk drivers</SectionLabel>
                    <p className="mt-1 mb-3.5 text-[12px] text-muted">
                      {plan ? 'Relative influence on the projected shortfall.' : 'SHAP contributions on the current forecast.'}
                    </p>
                    {plan ? (
                      <div className="flex flex-col gap-2.5">
                        {plan.risk_drivers.map((d) => (
                          <div key={d.factor} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                            <div className="min-w-0">
                              <div className="text-[12.5px] text-ink2 truncate">{d.factor}</div>
                              <div className="mt-1 h-[9px] rounded-full bg-[#e9eef3] overflow-hidden">
                                <div className="h-full rounded-full"
                                  style={{ width: `${d.influence_pct}%`, background: d.direction === 'negative' ? '#c4634f' : '#2f8d79' }} />
                              </div>
                            </div>
                            <span className="num text-[12px] text-ink2 w-9 text-right">{d.influence_pct}%</span>
                          </div>
                        ))}
                      </div>
                    ) : forecast ? (
                      <RiskDriverBars drivers={forecast.drivers} />
                    ) : <Skeleton className="h-24" />}
                  </div>
                )}

                {/* Corrective actions */}
                {plan && (
                  <div className="card p-5">
                    <SectionLabel>Recommended corrective actions</SectionLabel>
                    <div className="mt-3.5 flex flex-col gap-3.5">
                      {plan.corrective_actions.map((a) => (
                        <div key={a.rank} className="rounded-lg border border-lineSoft p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex gap-2.5 min-w-0">
                              <span className="num text-[11px] font-semibold text-muted mt-0.5">{a.rank}</span>
                              <h4 className="text-[13px] font-semibold text-ink2 leading-snug">{a.action}</h4>
                            </div>
                            <ActionConfidencePill level={a.confidence} />
                          </div>
                          <p className="mt-2 text-[12px] text-body leading-relaxed">{a.rationale}</p>
                          <div className="mt-2.5 flex items-center justify-between text-[11.5px]">
                            <code className="text-[10.5px] px-1.5 py-0.5 rounded bg-[#eaf0f7] text-[#33465e]">{a.driver}</code>
                            <span className="num text-[#1f6b4a] font-semibold">
                              +{tonnes(a.expected_recovery_tonnes)} recoverable
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3.5 text-[11px] text-muted leading-relaxed">
                      Recoverable tonnage is production regained against an existing plan. It is not a
                      resource or reserve figure. Synthetic demonstration data.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Horizontal timeline strip */}
            {plan && (
              <div className="card p-5 mt-5">
                <SectionLabel>Plan timeline</SectionLabel>
                <div className="relative mt-8 mb-2">
                  <div className="absolute left-[3%] right-[3%] top-[9px] h-[3px] bg-[#c6d1dd] rounded" />
                  <div className="relative flex justify-between px-[3%]">
                    {plan.plan_steps.map((s, i) => (
                      <div key={s.step} className="flex flex-col items-center gap-2 w-[15%]">
                        <span className="w-[18px] h-[18px] rounded-full ring-4 ring-white"
                          style={{ background: STEP_TONE[i % STEP_TONE.length] }} />
                        <span className="text-[11.5px] text-muted2 num text-center">{s.timeline}</span>
                        <span className="text-[11px] text-muted2 text-center leading-tight">{s.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <p className="mt-6 mb-2 text-[11px] text-muted leading-relaxed max-w-[110ch]">
              Mine names and design capacities are real (Global Energy Monitor, Global Iron Ore Mines Tracker).
              Every production figure on this screen is synthetic, generated from a seeded model. No Fe grade,
              resource or reserve estimate is produced anywhere in this prototype.
            </p>
          </div>
      </div>
    </AppShell>
  );
}

/* ------------------------------ helpers ------------------------------ */

function StatusChip({ status }: { status: 'completed' | 'in_progress' | 'not_started' }) {
  const map = {
    completed: { label: 'Completed', color: '#17674f', Icon: CheckCircle2 },
    in_progress: { label: 'In progress', color: '#1c70cc', Icon: CircleDot },
    not_started: { label: 'Not started', color: '#52657c', Icon: Circle },
  }[status] ?? { label: status, color: '#52657c', Icon: Circle };
  return (
    <span className="inline-flex items-center gap-1.5 h-[25px] px-2.5 rounded-lg bg-[#edf2f6] text-[12.5px]"
      style={{ color: map.color }}>
      <map.Icon size={12} /> {map.label}
    </span>
  );
}

function MetricCard({
  icon: Icon, tint, label, value, note, loading,
}: {
  icon: typeof Mountain; tint: string; label: string; value: string; note: string; loading?: boolean;
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-[50px] h-[50px] rounded-full grid place-items-center shrink-0"
        style={{ background: `${tint}1c`, color: tint }}>
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        {loading ? <Skeleton className="h-6 w-16 mb-1.5" />
          : <div className="text-[21px] font-bold text-ink2 num leading-none">{value}</div>}
        <div className="mt-1.5 text-[12.5px] text-[#53657d]">{label}</div>
        <div className="mt-0.5 text-[11px] text-muted truncate" title={note}>{note}</div>
      </div>
    </div>
  );
}

interface MineRisk { mine_id: string; p: number; gap: number }

/** Forecasts every mine once the records land, for the risk ranking table. */
function useMineRisks(records: ProductionRecord[], mineIds: string[]): MineRisk[] {
  const [risks, setRisks] = useState<MineRisk[]>([]);
  const key = `${records.length}:${mineIds.join(',')}`;

  useEffect(() => {
    let cancelled = false;
    if (!records.length || !mineIds.length) { setRisks([]); return; }
    void Promise.all(mineIds.map(async (id): Promise<MineRisk> => {
      const f: Forecast = await adapter.getForecast(id, 30);
      const planned = f.points.reduce((a, p) => a + p.planned, 0);
      const p50 = f.points.reduce((a, p) => a + p.p50, 0);
      return { mine_id: id, p: f.shortfall_probability, gap: Math.max(0, Math.round(planned - p50)) };
    })).then((rows) => {
      if (!cancelled) setRisks(rows.sort((a, b) => b.p - a.p));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return risks;
}
