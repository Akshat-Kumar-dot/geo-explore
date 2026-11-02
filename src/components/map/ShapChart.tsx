import type { ZoneDriver } from '../../types';
import { humanFeature } from '../../lib/format';

/**
 * Signed SHAP contributions: sorted by absolute magnitude,
 * positive to the right of a centre zero line, negative to the left.
 */
export default function ShapChart({
  drivers, tone = 'light',
}: { drivers: ZoneDriver[]; tone?: 'light' | 'dark' }) {
  const sorted = [...drivers].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const max = Math.max(...sorted.map((d) => Math.abs(d.contribution)), 0.01);
  const dark = tone === 'dark';

  return (
    <div className="flex flex-col gap-[7px]">
      {sorted.map((d) => {
        const w = (Math.abs(d.contribution) / max) * 50;
        const pos = d.contribution >= 0;
        return (
          <div key={d.name} className="grid grid-cols-[1fr_112px] items-center gap-2.5">
            <div className={`text-[11.5px] truncate ${dark ? 'text-white/85' : 'text-body'}`} title={humanFeature(d.name)}>
              {humanFeature(d.name)}
            </div>
            <div className="relative h-[13px]">
              <div className={`absolute inset-y-0 left-1/2 w-px ${dark ? 'bg-white/30' : 'bg-[#c7d2df]'}`} />
              <div
                className="absolute top-[1.5px] h-[10px] rounded-[2px]"
                style={{
                  left: pos ? '50%' : `${50 - w}%`,
                  width: `${w}%`,
                  background: pos ? '#2f8d79' : '#c4634f',
                }}
              />
            </div>
          </div>
        );
      })}
      <div className={`mt-0.5 flex justify-between text-[9.5px] ${dark ? 'text-white/45' : 'text-muted'}`}>
        <span>← lowers score</span>
        <span>raises score →</span>
      </div>
    </div>
  );
}
