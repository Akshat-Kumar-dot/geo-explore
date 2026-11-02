import { RAMP_CSS } from '../../lib/colors';
import { useMapStore } from '../../stores/mapStore';

/** Iron-ore surface ramp. Light chrome, and deliberately silent on Fe grade and tonnage. */
export default function MapLegend() {
  const layers = useMapStore((s) => s.layers);
  return (
    <div className="w-[264px] rounded-lg bg-white/95 backdrop-blur-[3px] border border-[#dbe3ec] shadow-float px-3.5 py-3">
      <div className="title-serif text-[13px] leading-none">Iron-ore surface probability</div>
      <div className="mt-1 text-[10px] text-[#8593a6] leading-none">Synthetic model score · not an Fe grade</div>

      <div className="mt-2.5 h-[12px] rounded-full border border-[#e3e9f0]" style={{ background: RAMP_CSS }} />
      <div className="mt-1.5 flex justify-between text-[10px] text-[#6b7a8d] num">
        <span>0.55</span><span>Low</span><span>Moderate</span><span>High</span><span>0.95</span>
      </div>

      {layers.mines && (
        <div className="mt-2.5 pt-2.5 border-t border-[#eef2f7] grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-[#54637a]">
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 18 18"><polygon points="9,2 17,16 1,16" fill="#fff" stroke="currentColor" strokeWidth="2" /></svg>
            Iron ore mine (GEM)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 18 18"><polygon points="9,2 17,16 1,16" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" /></svg>
            Proposed / mothballed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[7px] h-[7px] rounded-full bg-[#d4145a] ring-1 ring-white" />
            No mapped footprint
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-[10px] h-[8px] border border-dashed border-[#c9a86a] bg-[#f2bf39]/25" />
            Land-use constraint
          </span>
        </div>
      )}
    </div>
  );
}
