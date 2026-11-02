import { useEffect } from 'react';
import { useMapStore } from './stores/mapStore';
import { useRouteStore } from './stores/routeStore';
import { useUrlSync } from './lib/useUrlSync';
import MapView from './pages/MapView';
import PlanView from './pages/PlanView';

export default function App() {
  const view = useRouteStore((s) => s.view);
  const load = useMapStore((s) => s.load);

  useEffect(() => { void load(); }, [load]);
  useUrlSync();

  return <div className="h-full">{view === 'plan' ? <PlanView /> : <MapView />}</div>;
}
