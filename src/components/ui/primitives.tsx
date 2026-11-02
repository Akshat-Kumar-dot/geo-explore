import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-[#e6ecf3]', className)} />;
}

export function EmptyState({ icon, title, body }: { icon?: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-2">
      {icon && <div className="text-[#9fadbf] mb-1">{icon}</div>}
      <div className="text-[13.5px] font-semibold text-ink">{title}</div>
      <p className="text-[12.5px] text-muted max-w-[42ch] leading-relaxed">{body}</p>
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('label-cap', className)}>{children}</div>;
}

export function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 w-full text-left text-[12.5px] text-ink"
    >
      <span
        className={cn(
          'relative w-8 h-[18px] rounded-full transition-colors shrink-0',
          checked ? 'bg-brand' : 'bg-[#cfd8e3]',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all',
            checked ? 'left-[16px]' : 'left-[2px]',
          )}
        />
      </span>
      {label}
    </button>
  );
}

export function Slider({
  value, min, max, step, onChange, format,
}: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-[#172330] cursor-pointer"
      />
      <span className="num text-[12px] text-ink w-[52px] text-right tabular-nums">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

/** Radial gauge for a model probability. Labelled as a score, never as a confidence. */
export function ScoreGauge({
  value, size = 76, caption, tone = 'light',
}: { value: number; size?: number; caption?: string; tone?: 'light' | 'dark' }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const dash = c * Math.min(1, Math.max(0, value));
  const track = tone === 'dark' ? 'rgba(255,255,255,.18)' : '#e7edf2';
  const ink = tone === 'dark' ? '#fff' : '#172033';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth="7" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="currentColor" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
          fontSize={size * 0.26} fontWeight="700" fill={ink}
        >
          {value.toFixed(2)}
        </text>
      </svg>
      {caption && <div className="label-cap">{caption}</div>}
    </div>
  );
}
