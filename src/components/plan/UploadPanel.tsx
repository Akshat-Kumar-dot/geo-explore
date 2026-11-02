import { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, RotateCcw, Sparkles, FileDown } from 'lucide-react';
import { usePlanStore } from '../../stores/planStore';
import { parseProductionCsv } from '../../lib/parseProduction';
import { num, longDate } from '../../lib/format';
import { SectionLabel } from '../ui/primitives';
import { cn } from '../../lib/cn';

export default function UploadPanel() {
  const { summary, status, fileName, records, mines, loadSample, ingest, generatePlan, reset } = usePlanStore();
  const [dragging, setDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setParseError(null);
    try {
      const text = await file.text();
      const { rows, unknownColumns, missingColumns } = parseProductionCsv(text);
      if (missingColumns.length) {
        setParseError(`Missing required column${missingColumns.length > 1 ? 's' : ''}: ${missingColumns.join(', ')}`);
        return;
      }
      if (!rows.length) { setParseError('No usable rows found in that file.'); return; }
      ingest(rows, file.name, unknownColumns, missingColumns);
    } catch {
      setParseError('That file could not be read as CSV.');
    }
  }

  const preview = records.slice(0, 6);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3.5">
        <SectionLabel>Production data</SectionLabel>
        {summary && (
          <button className="text-[11.5px] text-accent hover:underline inline-flex items-center gap-1" onClick={reset}>
            <RotateCcw size={11} /> Clear
          </button>
        )}
      </div>

      {!summary && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
            onClick={() => input.current?.click()}
            className={cn(
              'rounded-lg border-2 border-dashed px-6 py-9 text-center cursor-pointer transition-colors',
              dragging ? 'border-accent bg-[#eef4fb]' : 'border-[#cfd8e3] hover:border-[#9fb3ca] hover:bg-[#fbfcfe]',
            )}
          >
            <UploadCloud size={26} className="mx-auto mb-2.5 text-[#7d8ea3]" strokeWidth={1.5} />
            <div className="text-[13.5px] font-semibold text-ink">Drop a daily production CSV</div>
            <div className="mt-1 text-[12px] text-muted">or click to browse — parsed in your browser, nothing is uploaded</div>
          </div>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />

          {parseError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#fbeceb] border border-[#f0cdca] px-3 py-2.5 text-[12px] text-[#a4342b]">
              <AlertTriangle size={14} className="mt-px shrink-0" /> {parseError}
            </div>
          )}

          <a
            href="/sample_production_iron_12m.csv"
            download
            className="mt-4 flex items-center gap-2.5 rounded-lg border border-lineSoft bg-[#fbfcfe] px-3.5 py-2.5 hover:border-[#9fb3ca] hover:bg-white transition-colors"
          >
            <FileDown size={16} strokeWidth={1.7} className="text-[#54637a] shrink-0" />
            <span className="min-w-0">
              <span className="block text-[12.5px] text-ink">Reference file</span>
              <span className="block text-[11.5px] text-muted">
                Download a correctly formatted 12-month example to match your own export against
              </span>
            </span>
          </a>

          <button className="btn-dark w-full justify-center mt-4" onClick={() => void loadSample()} disabled={status === 'validating'}>
            <Sparkles size={15} strokeWidth={1.7} />
            {status === 'validating' ? 'Loading…' : 'Load sample data'}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            Three years for ten real iron ore mines — synthetic records, seeded, identical every run.
          </p>
        </>
      )}

      {summary && (
        <>
          <div className="flex items-center gap-2.5 rounded-lg bg-[#ecf6f1] border border-[#c9e3d6] px-3.5 py-2.5">
            <CheckCircle2 size={16} className="text-[#1f6b4a] shrink-0" />
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-[#17553a] truncate">{fileName}</div>
              <div className="text-[11.5px] text-[#3d6d57] num">Validated · {num(summary.rows)} rows</div>
            </div>
          </div>

          <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
            <div><dt className="label-cap mb-0.5">Rows</dt><dd className="num text-ink font-semibold">{num(summary.rows)}</dd></div>
            <div><dt className="label-cap mb-0.5">Mines covered</dt><dd className="num text-ink font-semibold">{summary.mines.length} of {mines.length || 10}</dd></div>
            <div className="col-span-2"><dt className="label-cap mb-0.5">Date range</dt>
              <dd className="num text-ink font-semibold">{longDate(summary.from)} → {longDate(summary.to)}</dd></div>
            <div><dt className="label-cap mb-0.5">Missing values</dt>
              <dd className={cn('num font-semibold', summary.missingCells ? 'text-[#9a6a1c]' : 'text-ink')}>{num(summary.missingCells)}</dd></div>
            <div><dt className="label-cap mb-0.5">Unknown columns</dt>
              <dd className="num text-ink font-semibold">{summary.unknownColumns.length || '—'}</dd></div>
          </dl>

          {summary.unknownColumns.length > 0 && (
            <p className="mt-2 text-[11px] text-[#9a6a1c] leading-relaxed">
              Ignored: {summary.unknownColumns.join(', ')}
            </p>
          )}

          <div className="mt-4">
            <div className="label-cap mb-2">Preview</div>
            <div className="overflow-x-auto scroll-thin rounded-lg border border-lineSoft">
              <table className="text-[11px] min-w-full">
                <thead className="bg-[#fbfcfe]">
                  <tr className="text-muted2">
                    {['date', 'mine', 'planned', 'actual', 'equip %', 'rain'].map((h) => (
                      <th key={h} className="px-2.5 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t border-lineSoft">
                      <td className="px-2.5 py-1.5 num whitespace-nowrap">{r.date}</td>
                      <td className="px-2.5 py-1.5">{r.mine_id}</td>
                      <td className="px-2.5 py-1.5 num">{num(r.planned_tonnes)}</td>
                      <td className="px-2.5 py-1.5 num">{num(r.actual_tonnes)}</td>
                      <td className="px-2.5 py-1.5 num">{r.equipment_available_pct.toFixed(0)}</td>
                      <td className="px-2.5 py-1.5 num">{r.rainfall_mm.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button
            className="btn-dark w-full justify-center mt-4"
            onClick={() => void generatePlan()}
            disabled={status === 'generating'}
          >
            <FileSpreadsheet size={15} strokeWidth={1.7} />
            {status === 'generating' ? 'Generating plan…' : 'Generate production plan'}
          </button>
        </>
      )}
    </div>
  );
}
