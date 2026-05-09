import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'trading-app:theme-v1';

/** Toggle between dark (default) and light themes. Persists to localStorage.
 *  The `data-theme` attribute on <html> drives CSS-var swaps in index.html. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'light' || raw === 'dark') return raw;
    } catch {
      /* ignore */
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* quota */ }
  }, [theme]);

  return [theme, setTheme];
}
