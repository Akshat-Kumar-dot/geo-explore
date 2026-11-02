import { useEffect, useState } from 'react';
import { Plus, Minus, LocateFixed, Maximize2, Minimize2 } from 'lucide-react';

/** Zoom / locate / fullscreen / north, laid out as in the design. */
export default function MapControls({
  onZoom, onLocate,
}: { onZoom: (delta: number) => void; onLocate: () => void }) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const h = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  const box = 'bg-white border border-lineStrong rounded-lg shadow-card';
  const btn = 'w-[42px] h-[41px] grid place-items-center text-ink hover:bg-surfaceAlt transition-colors';

  return (
    <div className="flex flex-col gap-3 items-end">
      <div className={box}>
        <button className={`${btn} rounded-t-lg`} onClick={() => onZoom(1)} aria-label="Zoom in"><Plus size={19} /></button>
        <div className="h-px bg-[#e1e6ed]" />
        <button className={`${btn} rounded-b-lg`} onClick={() => onZoom(-1)} aria-label="Zoom out"><Minus size={19} /></button>
      </div>
      <button className={`${box} ${btn} rounded-lg`} onClick={onLocate} aria-label="Reset to study area"><LocateFixed size={18} /></button>
      <button className={`${box} ${btn} rounded-lg`} onClick={toggleFull} aria-label="Toggle fullscreen">
        {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>
      <div className={`${box} w-[42px] h-[50px] flex flex-col items-center justify-center gap-0.5`} aria-label="North">
        <svg width="14" height="28" viewBox="0 0 14 28">
          <path d="M7 1 L13 27 L7 22 L1 27 Z" fill="#26313b" />
          <path d="M7 1 L10 17 L7 23 L4 17 Z" fill="#e24d45" />
        </svg>
        <span className="text-[9.5px] font-semibold text-ink leading-none">N</span>
      </div>
    </div>
  );
}
