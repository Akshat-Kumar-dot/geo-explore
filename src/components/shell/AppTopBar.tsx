import { useEffect, useRef, useState } from 'react';
import {
  Search, Layers, Map as MapIcon, BarChart3, List, ClipboardList,
  ChevronDown, PanelLeft, Download, Layers2, Moon, Sun,
} from 'lucide-react';
import { useThemeStore } from '../../stores/themeStore';
import { useMapStore, useVisibleZones } from '../../stores/mapStore';
import { useRouteStore } from '../../stores/routeStore';
import { useUiStore } from '../../stores/uiStore';
import { LayersPanel, BasemapPanel } from '../map/MapPanels';
import { exportZonesCsv } from '../../lib/exportCsv';
import { cn } from '../../lib/cn';
import Brand from '../map/Brand';
import { mapRef } from '../map/MapCanvas';
import { BELT_NAME } from '../../data/fixtures/mines';

type Menu = 'layers' | 'basemap' | null;

/** One top bar for every screen. Navigation, map controls, search, account. */
export default function AppTopBar() {
  const [menu, setMenu] = useState<Menu>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const wrap = useRef<HTMLElement>(null);

  const view = useRouteStore((s) => s.view);
  const go = useRouteStore((s) => s.go);
  const centreView = useMapStore((s) => s.centreView);
  const setCentreView = useMapStore((s) => s.setCentreView);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const zones = useVisibleZones();
  const mines = useMapStore((s) => s.mines);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? [
        ...zones.filter((z) => z.zone_id.toLowerCase().includes(q)).slice(0, 5).map((z) => ({
          key: z.zone_id, label: z.zone_id,
          note: `Rank ${z.rank} · ${BELT_NAME[z.belt]} · near ${z.nearest_mine}`,
          run: () => { go('map'); setCentreView('map'); useMapStore.getState().selectZone(z.zone_id, 'list'); },
        })),
        ...mines.filter((m) => m.name.toLowerCase().includes(q) || m.district.toLowerCase().includes(q))
          .slice(0, 5).map((m) => ({
            key: m.mine_id, label: m.name,
            note: `${m.status} · ${m.district}, ${m.state}`,
            run: () => {
              go('map'); setCentreView('map');
              mapRef.current?.flyTo({ center: [m.lon, m.lat], zoom: 12.5, duration: 900 });
            },
          })),
      ]
    : [];

  const onMap = view === 'map';
  const nav = [
    { id: 'map', label: 'Map', icon: MapIcon, active: onMap && centreView === 'map',
      run: () => { go('map'); setCentreView('map'); } },
    { id: 'list', label: 'Ranked list', icon: List, active: onMap && centreView === 'list',
      run: () => { go('map'); setCentreView('list'); } },
    { id: 'analysis', label: 'Analysis', icon: BarChart3, active: onMap && centreView === 'analysis',
      run: () => { go('map'); setCentreView('analysis'); } },
    { id: 'plan', label: 'Production plan', icon: ClipboardList, active: view === 'plan',
      run: () => go('plan') },
  ];

  const btn = 'inline-flex items-center gap-2 h-9 px-3 rounded-lg text-[13px] transition-colors whitespace-nowrap';

  return (
    <header
      ref={wrap}
      className="relative z-30 h-[57px] shrink-0 flex items-center gap-1.5 px-3 bg-white border-b border-line"
    >
      <button
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        aria-pressed={sidebarOpen}
        className={cn(btn, '!px-2.5', sidebarOpen ? 'text-ink hover:bg-surfaceAlt' : 'text-[#54637a] hover:bg-surfaceAlt')}
      >
        <PanelLeft size={17} strokeWidth={1.7} />
      </button>

      {!sidebarOpen && <div className="pl-1 pr-2"><Brand compact /></div>}

      <div className="w-px h-6 bg-line mx-1" />

      <nav className="flex items-center gap-0.5">
        {nav.map(({ id, label, icon: Icon, active, run }) => (
          <button
            key={id}
            onClick={run}
            aria-current={active ? 'page' : undefined}
            className={cn(btn, active ? 'bg-surfaceAlt text-ink font-semibold' : 'text-[#3c4a5e] hover:bg-surfaceAlt')}
          >
            <Icon size={16} strokeWidth={active ? 1.9 : 1.6} />
            <span className="hidden lg:inline">{label}</span>
          </button>
        ))}
      </nav>

      <div className="w-px h-6 bg-line mx-1" />

      <button
        onClick={() => { go('map'); setMenu(menu === 'layers' ? null : 'layers'); }}
        className={cn(btn, menu === 'layers' ? 'bg-surfaceAlt text-ink' : 'text-[#3c4a5e] hover:bg-surfaceAlt')}
      >
        <Layers size={16} strokeWidth={1.6} /><span className="hidden xl:inline">Layers</span>
      </button>
      <button
        onClick={() => { go('map'); setMenu(menu === 'basemap' ? null : 'basemap'); }}
        className={cn(btn, menu === 'basemap' ? 'bg-surfaceAlt text-ink' : 'text-[#3c4a5e] hover:bg-surfaceAlt')}
      >
        <Layers2 size={16} strokeWidth={1.6} /><span className="hidden xl:inline">Basemap</span>
        <ChevronDown size={13} strokeWidth={1.7} />
      </button>

      <div className="relative flex-1 min-w-[140px] max-w-[440px] mx-2">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#61738a]" strokeWidth={1.9} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 140)}
          placeholder="Search polygons, iron mines, towns…"
          className="w-full h-9 rounded-lg bg-[#f2f5f9] border border-[#d9e1ea] pl-9 pr-3 text-[12.5px] text-ink placeholder:text-[#7b8798] outline-none focus:border-[#9fb3ca] transition-colors"
        />
        {focused && results.length > 0 && (
          <div className="absolute top-[42px] left-0 right-0 rounded-xl bg-white border border-lineStrong shadow-float py-1.5 overflow-hidden">
            {results.map((r) => (
              <button key={r.key} onMouseDown={r.run} className="w-full text-left px-4 py-2 hover:bg-surfaceAlt transition-colors">
                <div className="text-[13px] text-ink num">{r.label}</div>
                <div className="text-[11.5px] text-muted num">{r.note}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => exportZonesCsv(zones)}
        className={cn(btn, 'text-[#3c4a5e] hover:bg-surfaceAlt')}
        title="Export the ranked target list"
      >
        <Download size={16} strokeWidth={1.6} /><span className="hidden xl:inline">Export</span>
      </button>

      <button
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        className={cn(btn, '!px-2.5 text-[#3c4a5e] hover:bg-surfaceAlt')}
      >
        {theme === 'dark' ? <Sun size={16} strokeWidth={1.6} /> : <Moon size={16} strokeWidth={1.6} />}
      </button>

      <div className="ml-1 flex items-center gap-2 pl-1">
        <div className="w-8 h-8 rounded-full bg-[#172330] grid place-items-center text-white text-[11px] font-semibold">AK</div>
        <span className="text-[12.5px] text-ink2 hidden 2xl:inline">Akshat Kumar</span>
        <ChevronDown size={14} strokeWidth={1.6} className="text-[#526579]" />
      </div>

      {menu === 'layers' && <div className="absolute top-[54px] left-[300px]"><LayersPanel /></div>}
      {menu === 'basemap' && <div className="absolute top-[54px] left-[400px]"><BasemapPanel /></div>}
    </header>
  );
}
