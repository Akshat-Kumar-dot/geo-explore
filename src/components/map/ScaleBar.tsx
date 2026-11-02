import { useEffect, useState } from 'react';
import { mapRef } from './MapCanvas';

const NICE_KM = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
const MAX_PX = 190;

/**
 * Map scale, laid out in the same stack as the legend so the two can never
 * collide. Reads metres-per-pixel at the map centre on every move.
 */
export default function ScaleBar() {
  const [bar, setBar] = useState<{ px: number; km: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const m = mapRef.current;
      if (!m) return;
      const c = m.getCenter();
      const metresPerPx =
        (156543.03392 * Math.cos((c.lat * Math.PI) / 180)) / Math.pow(2, m.getZoom());
      const maxKm = (metresPerPx * MAX_PX) / 1000;
      const km = [...NICE_KM].reverse().find((k) => k <= maxKm) ?? NICE_KM[0];
      setBar({ px: (km * 1000) / metresPerPx, km });
    };

    const tick = () => { update(); raf = requestAnimationFrame(() => cancelAnimationFrame(raf)); };
    const m = mapRef.current;
    update();
    m?.on('move', tick);
    m?.on('load', update);
    // The map may not exist on first paint.
    const retry = setTimeout(update, 600);
    return () => { m?.off('move', tick); m?.off('load', update); clearTimeout(retry); };
  }, []);

  if (!bar) return null;
  const half = Math.round(bar.km / 2);

  return (
    <div className="select-none pointer-events-none" style={{ width: bar.px }}>
      <div className="flex justify-between map-label" style={{ fontSize: 10.5, WebkitTextStrokeWidth: '2.5px' }}>
        <span className="num">0</span>
        <span className="num">{half}</span>
        <span className="num">{bar.km} km</span>
      </div>
      <svg width={bar.px} height="9" className="mt-0.5 block">
        <g stroke="#fff" strokeWidth="1.6" fill="none" style={{ filter: 'drop-shadow(0 1px 1.5px rgba(9,16,24,.9))' }}>
          <path d={`M1 8 H${bar.px - 1}`} />
          <path d={`M1 1 V8 M${bar.px / 2} 4 V8 M${bar.px - 1} 1 V8`} />
        </g>
      </svg>
    </div>
  );
}
