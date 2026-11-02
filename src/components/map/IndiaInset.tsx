import { useEffect, useRef, useState } from 'react';
import { Map as MLMap } from 'maplibre-gl';
import { mapRef } from './MapCanvas';
import { AOI_BBOX } from '../../data/fixtures/mines';

/**
 * Locator inset: a real, non-interactive basemap of India with a red frame
 * tracking the main map's current viewport. Uses the same token-free Esri
 * tile service as the main map, so nothing can expire mid-demo.
 */

const INDIA_BOUNDS: [number, number, number, number] = [67.0, 6.0, 98.5, 36.5];
const W = 150, H = 172;
const MIN_BOX = 9;

export default function IndiaInset() {
  const host = useRef<HTMLDivElement>(null);
  const inset = useRef<MLMap | null>(null);
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (!host.current || inset.current) return;
    const m = new MLMap({
      container: host.current,
      interactive: false,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          base: {
            type: 'raster',
            tileSize: 256,
            maxzoom: 13,
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
          },
        },
        layers: [{ id: 'base', type: 'raster', source: 'base' }],
      },
      bounds: INDIA_BOUNDS,
      fitBoundsOptions: { padding: 4 },
    });
    inset.current = m;
    return () => { m.remove(); inset.current = null; };
  }, []);

  // Track the main map's viewport, falling back to the study area before it loads.
  useEffect(() => {
    const draw = () => {
      const mini = inset.current;
      if (!mini) return;
      const main = mapRef.current;

      let sw: [number, number], ne: [number, number];
      if (main) {
        const b = main.getBounds();
        sw = [b.getWest(), b.getSouth()];
        ne = [b.getEast(), b.getNorth()];
      } else {
        sw = [AOI_BBOX[0], AOI_BBOX[1]];
        ne = [AOI_BBOX[2], AOI_BBOX[3]];
      }

      const a = mini.project(sw);
      const c = mini.project(ne);
      let l = Math.min(a.x, c.x), t = Math.min(a.y, c.y);
      let w = Math.abs(c.x - a.x), h = Math.abs(a.y - c.y);

      // Keep the frame visible when the main map is zoomed right in.
      if (w < MIN_BOX) { l -= (MIN_BOX - w) / 2; w = MIN_BOX; }
      if (h < MIN_BOX) { t -= (MIN_BOX - h) / 2; h = MIN_BOX; }

      setBox({ l, t, w, h });
    };

    // Projecting two points is cheap, and requestAnimationFrame does not run in a
    // backgrounded tab — so draw directly and throttle by timestamp instead.
    let last = 0;
    const schedule = () => {
      const now = performance.now();
      if (now - last < 60) return;
      last = now;
      draw();
    };

    const main = mapRef.current;
    main?.on('move', schedule);
    inset.current?.on('load', draw);
    // The main map may mount after this one, and tiles settle asynchronously.
    const settle = setInterval(draw, 400);
    draw();

    return () => {
      clearInterval(settle);
      main?.off('move', schedule);
      inset.current?.off('load', draw);
    };
  }, []);

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-white/70 shadow-float bg-[#e9eef2]"
      style={{ width: W, height: H }}
    >
      <div ref={host} className="absolute inset-0 inset-basemap" />

      {box && (
        <div
          data-inset-box
          className="absolute pointer-events-none rounded-[2px]"
          style={{
            left: box.l, top: box.t, width: box.w, height: box.h,
            border: '2px solid #e24d45',
            background: 'rgba(226,77,69,0.12)',
            boxShadow: '0 0 0 1px rgba(255,255,255,.7)',
          }}
        />
      )}

      <span className="absolute top-2 right-2.5 text-[12.5px] font-semibold text-[#4a5769] pointer-events-none select-none">
        India
      </span>
    </div>
  );
}
