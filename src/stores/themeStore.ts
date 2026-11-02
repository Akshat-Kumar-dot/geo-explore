import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const KEY = 'geoexplore-theme';

/** index.html sets the class before first paint; read it back so the store agrees. */
const initial = (): Theme =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: theme just won't persist */ }
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initial(),
  toggle: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
    apply(theme);
    set({ theme });
  },
}));
