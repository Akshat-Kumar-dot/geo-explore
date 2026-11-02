/** Wordmark from the approved design. */
export default function Brand({
  subtitle = 'Iron Ore Mapping', compact = false,
}: { subtitle?: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <svg width="34" height="22" viewBox="16 14 62 36" className="shrink-0 brand-mark">
          <path className="facet-mid" d="M20 48 L43 17 L69 48 L58 48 L43 29 L31 48 Z" fill="#3e7480" />
          <path className="facet-dark" d="M31 48 L43 30 L51 41 L47 47 L43 41 L39 48 Z" fill="#1f3341" />
          <path className="facet-light" d="M52 48 L61 33 L75 48 Z" fill="#5d8e98" />
        </svg>
        <span className="text-[15px] font-bold text-ink tracking-[-0.01em]">GeoExplore</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <svg width="56" height="34" viewBox="14 12 65 40" className="shrink-0 brand-mark">
        <path className="facet-mid" d="M20 48 L43 17 L69 48 L58 48 L43 29 L31 48 Z" fill="#3e7480" />
        <path className="facet-dark" d="M31 48 L43 30 L51 41 L47 47 L43 41 L39 48 Z" fill="#1f3341" />
        <path className="facet-light" d="M52 48 L61 33 L75 48 Z" fill="#5d8e98" />
      </svg>
      <div className="leading-none">
        <div className="text-[21px] font-bold text-ink tracking-[-0.01em]">GeoExplore</div>
        <div className="mt-[5px] text-[11.5px] text-[#344154]">{subtitle}</div>
      </div>
    </div>
  );
}
