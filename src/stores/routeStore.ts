import { create } from 'zustand';

export type View = 'map' | 'plan';

interface RouteState {
  view: View;
  go: (v: View) => void;
}

const readView = (): View =>
  new URLSearchParams(window.location.search).get('view') === 'plan' ? 'plan' : 'map';

export const useRouteStore = create<RouteState>((set) => ({
  view: readView(),
  go: (view) => set({ view }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => useRouteStore.setState({ view: readView() }));
}
